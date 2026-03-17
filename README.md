# ProofVote

Stake-backed, one-wallet-one-vote polling on Algorand. Every vote is backed by a refundable ALGO stake locked in a smart contract escrow. Poll metadata lives off-chain in MySQL; stake, vote counts, and withdrawal state are fully on-chain.

---

## Architecture

```
┌─────────────┐     sign txn / signData      ┌──────────────────┐
│  Pera/Defly │ ◄──────────────────────────► │  Next.js (Vercel)│
│   Wallet    │                               │  web/            │
└─────────────┘                               └────────┬─────────┘
                                                       │
                                         ┌─────────────┴──────────────┐
                                         │                            │
                                  ┌──────▼───────┐          ┌────────▼───────┐
                                  │   Algorand   │          │  MySQL         │
                                  │   TestNet    │          │  (CyberFolks)  │
                                  │  (algod via  │          │  VoteMetadata  │
                                  │   AlgoNode)  │          │  (Prisma)      │
                                  └──────────────┘          └────────────────┘
                                  ProofVote contract:
                                  - createVote (box storage)
                                  - vote (stake escrow)
                                  - withdraw (refund)
                                  - sweepUser (unclaimed stakes)
```

---

## How It Works

### On-chain interaction — ATC builder pattern

Every smart contract method has a corresponding builder function in `web/lib/contract-client.ts`. Each function:

1. Fetches current network parameters from algod (`getTransactionParams`)
2. Constructs any required payment transaction (MBR cover, stake deposit)
3. Adds the ABI method call to an `AtomicTransactionComposer`
4. Returns the configured ATC — the caller executes it with `.execute(algod, 4)`

```
contract-client.ts          ProofVote contract (on-chain)
──────────────────          ─────────────────────────────
buildCreateVoteAtc()   →    createVote(startAt, endAt, optionCount, stake, withdrawWindow, pay)
buildVoteAtc()         →    vote(voteId, choice, pay)
buildWithdrawAtc()     →    withdraw(voteId)
buildBatchWithdrawAtc()→    withdraw(voteId) × N   (up to 16 in one atomic group)
buildSweepUserAtc()    →    sweepUser(voteId, userAddress)
buildBatchSweepAtc()   →    sweepUser(voteId, userAddress) × N
```

**Why ATC?**
The `AtomicTransactionComposer` groups transactions atomically — if the method call fails, the payment is also rolled back. This guarantees no ALGO is lost due to a contract rejection.

**Why PayTxn before AppCall?**
The ARC-4 ABI framework reads the payment transaction from the preceding slot in the group. The payment must be added first.

**Box references**
Methods that read or write box storage must declare which boxes they'll access. Each builder supplies the correct box refs (`generateVoteBoxName`, `generateUserVoteBoxName`) so the AVM can pre-load them.

---

### Off-chain authentication — signature verification

Poll metadata (title, description, option labels, URL slug) is stored off-chain in MySQL and submitted to the Next.js API after the on-chain `createVote` call. Without authentication, anyone could register metadata for a voteId they didn't create.

**The problem:** the API cannot call algod to check "who created this vote" cheaply for every request.

**The solution:** the vote creator signs a canonical message with their wallet before submitting metadata. The API verifies that signature server-side.

```
┌──────────────┐  1. createVote tx   ┌─────────────────┐
│  Browser /   │ ─────────────────►  │  Algorand        │
│  Wallet      │ ◄─────────────────  │  (returns voteId)│
└──────┬───────┘  2. voteId          └─────────────────┘
       │
       │  3. wallet.signData("ProofVote: create metadata for voteId=N slug=Y")
       │     → signature (base64)
       │
       │  4. POST /api/votes  { voteId, slug, title, ..., creatorWallet, signature }
       ▼
┌──────────────┐  5. verifyVoteCreationSignature(voteId, slug, creatorWallet, signature)
│  Next.js API │     → algosdk.verifyBytes(msgBytes, sigBytes, address)
│              │  6. if valid → INSERT into MySQL
└──────────────┘     else → 401 Unauthorized
```

**Canonical message format:**
```
ProofVote: create metadata for voteId=<N> slug=<Y>
```

The message binds the signature to a specific `(voteId, slug)` pair. Replaying a signature for a different voteId or slug will fail verification.

**Domain separation (`MX` prefix)**
`algosdk.verifyBytes` internally prepends `"MX"` to the message bytes before verification. This prevents a valid Algorand transaction signature from being reused as an arbitrary message signature — a standard protection against signature replay attacks across different contexts.

The signature itself is **not stored** in the database — it is only used for the one-time ownership proof.

---

### Contract deployment — `contracts/deploy/deploy.ts`

Deploys a fresh instance of the ProofVote contract to Algorand and prints the resulting `APP_ID`. Run once per environment (TestNet / MainNet).

```
contracts/
├── artifacts/
│   ├── ProofVote.approval.teal   ← compiled approval program (gitignored)
│   ├── ProofVote.clear.teal      ← compiled clear program   (gitignored)
│   └── ProofVote.arc32.json      ← ABI spec + method signatures (committed)
└── deploy/
    └── deploy.ts                 ← this script
```

**Step-by-step flow:**

1. **Load config from `.env`**
   Reads `DEPLOYER_MNEMONIC`, `ALGOD_SERVER`, `ALGOD_PORT`, `ALGOD_TOKEN`. Aborts if the mnemonic is missing.

2. **Check deployer balance**
   Calls `algod.accountInformation()` and verifies the deployer has at least 0.5 ALGO. Minimum balance covers contract creation MBR and transaction fees.

3. **Load TEAL from `artifacts/`**
   Reads the pre-compiled `ProofVote.approval.teal` and `ProofVote.clear.teal` from disk. These files are produced by `npm run build:contracts` (TEALScript → TEAL).

4. **Compile TEAL via algod**
   Sends both source files to the algod `/compile` endpoint, which returns bytecode as base64. This must be done against the target network (TestNet/MainNet) because the opcode version is network-dependent.

5. **Load the ABI contract** from `ProofVote.arc32.json`
   Creates an `algosdk.ABIContract` and looks up the `createApplication` method by name.

6. **Encode initial platform parameters** as ABI uint64 arguments:

   | Parameter               | Default value       |
   |-------------------------|---------------------|
   | `defaultStake`          | 1 000 000 µALGO (1 ALGO) |
   | `minStake`              | 500 000 µALGO       |
   | `maxStake`              | 10 000 000 µALGO    |
   | `defaultWithdrawWindow` | 604 800 s (7 days)  |

   These are stored in the contract's global state and returned by `fetchAppConfig()` at runtime.

7. **Build and execute the create transaction via ATC**
   Uses `AtomicTransactionComposer.addMethodCall()` with `appID: 0` — this signals Algorand to create a new application. Declares the global state schema: 1 byte slice (`platformOwner`) + 5 integers.

8. **Wait for confirmation and extract `APP_ID`**
   Calls `algosdk.waitForConfirmation()`, then reads `confirmation["application-index"]` — the freshly assigned numeric ID of the deployed contract.

9. **Output results**
   Prints `APP_ID`, `APP_ADDRESS`, and the transaction ID to stdout. Writes the same data to `contracts/.deploy-result.json` for scripting/CI use.

   ```
   ✅ Contract deployed successfully
      APP_ID      : 123456789
      APP_ADDRESS : ABCDE...XYZ
      Txn         : 3KPQR...ABC

   Add to web/.env.local:
     NEXT_PUBLIC_APP_ID=123456789
   ```

> **Re-deploying** creates a brand-new contract instance with a new `APP_ID`. There is no upgrade mechanism — existing votes live on the old contract forever.

---

## Tech Stack

| Layer              | Technology                  | Rationale                                                          |
| ------------------ | --------------------------- | ------------------------------------------------------------------ |
| Smart contract     | TEALScript (Algorand AVM)   | Type-safe TS → TEAL; ARC-4/ARC-56 ABI out of the box               |
| Monorepo tooling   | AlgoKit + npm workspaces    | Standard Algorand dev environment; contracts and web share types   |
| Wallet integration | @txnlab/use-wallet-react v4 | Supports Pera, Defly, WalletConnect; handles signer plumbing       |
| Frontend           | Next.js 16 (App Router)     | SSR for SEO on poll list; client components for wallet interaction |
| UI components      | shadcn/ui + Tailwind CSS    | Accessible, composable; no runtime overhead                        |
| Database ORM       | Prisma 6 + MySQL            | Type-safe queries; CyberFolks provides managed MySQL               |
| Validation         | Zod 4                       | Schema-first API validation with TypeScript inference              |
| Rate limiting      | In-memory sliding window    | Simple; acceptable for low-traffic TestNet MVP                     |
| Deployment         | Vercel                      | Zero-config Next.js; env vars via dashboard                        |

---

## Quickstart

### 1. Clone and install

```bash
git clone <repo-url>
cd proofvote
npm install
```

### 2. Configure environment

```bash
cp web/.env.local.example web/.env.local
# Fill in: DATABASE_URL, NEXT_PUBLIC_APP_ID, NEXT_PUBLIC_PLATFORM_OWNER_ADDRESS
```

See `web/README.md` for the full variable reference.

### 3. Set up the database

```bash
cd web
npx prisma migrate dev --name init
```

### 4. Deploy the contract (TestNet)

```bash
cp contracts/.env.example contracts/.env
# Fill in: DEPLOYER_MNEMONIC
npm run build:contracts
npm run deploy --workspace=contracts
# Copy the printed APP_ID → NEXT_PUBLIC_APP_ID in web/.env.local
```

### 5. Start the dev server

```bash
npm run dev          # http://localhost:3000
```

---

## Workspace Scripts

```bash
npm run dev              # Start Next.js dev server (web/)
npm run build            # Production build (web/)
npm run test             # Jest tests (web/)
npm run build:contracts  # Compile TEALScript → TEAL + ABI JSON
npm run test:contracts   # Contract unit tests (requires LocalNet)
npm run test:all         # contracts + web tests
```

---

## Algorand Networks

| Network      | When to use                                                              | Real ALGO? |
| ------------ | ------------------------------------------------------------------------ | ---------- |
| **mainnet**  | Production — real funds, real consequences. Use only for final launch.   | Yes        |
| **testnet**  | Default for development. Free test ALGO from the dispenser. No real risk.| No         |
| **localnet** | Fully offline, instant finality. Requires AlgoKit (`algokit localnet start`). | No    |

### TestNet resources

- Explorer: https://testnet.algoexplorer.io
- Dispenser: https://bank.testnet.algorand.network
- Algod (AlgoNode): https://testnet-api.algonode.cloud

---

## Glossary (Algorand/Blockchain Terms)

For developers new to blockchain or Algorand ecosystem:

| Term | Description |
|------|-------------|
| **Algorand** | Layer-1 blockchain with instant finality and low fees. Uses Pure Proof-of-Stake consensus. |
| **ALGO** | Native cryptocurrency of Algorand. Used for transaction fees and staking. |
| **microALGO** | Smallest unit of ALGO. 1 ALGO = 1,000,000 microALGO (like satoshis for Bitcoin). |
| **Smart Contract** | Self-executing code stored on blockchain. In Algorand: compiled to TEAL bytecode. |
| **TEAL** | Transaction Execution Approval Language — Algorand's smart contract language (assembly-like). |
| **TEALScript** | TypeScript-to-TEAL compiler. Write contracts in TypeScript, compile to TEAL. |
| **AVM** | Algorand Virtual Machine — executes TEAL bytecode on-chain. |
| **ARC-4** | Algorand standard for encoding/decoding data structures to binary format (like JSON but binary). |
| **ABI** | Application Binary Interface — defines how to call smart contract methods and decode results. |
| **Box Storage** | Key-value storage in Algorand contracts. Persistent data that survives between transactions. |
| **algod** | Algorand node daemon. HTTP API for reading blockchain state and submitting transactions. |
| **Address** | 58-character string identifying an Algorand account (e.g., `MDV4NQNW6...Y4YVLDPLAY`). |
| **Transaction** | Atomic operation on Algorand (payment, contract call, etc.). Signed by wallet. |
| **Wallet** | App that stores private keys and signs transactions (Pera, Defly, etc.). |
| **TestNet** | Test network with free ALGO for development. No real monetary value. |
| **MainNet** | Production Algorand network with real ALGO and real monetary value. |
| **MBR** | Minimum Balance Requirement — ALGO locked per account/contract to prevent spam. |
| **Escrow** | Smart contract that temporarily holds funds until certain conditions are met. |
| **Signer** | Wallet function that cryptographically signs transactions with private key. |

---

## Development Notes

### Why BigInt instead of Number?

In blockchain applications, we use `bigint` instead of `number` for all numeric values:

```typescript
// ❌ JavaScript Number (unsafe for blockchain)
const stake = 1000000;              // IEEE 754 double precision
const maxSafe = 9007199254740991;   // MAX_SAFE_INTEGER
const overflow = 9007199254740992 + 1; // 9007199254740992 (precision loss!)

// ✅ BigInt (blockchain standard)
const stake = 1_000_000n;           // Infinite precision
const maxUint64 = 18446744073709551615n; // Full uint64 range
const precise = 9007199254740992n + 1n;  // 9007199254740993n (exact!)
```

**Key reasons:**

1. **Precision Loss:** JavaScript `number` loses precision after ~15 digits. Blockchain often uses numbers like `18446744073709551615` (max uint64).

2. **Financial Safety:** In crypto applications, losing even 1 unit can mean lost funds. `bigint` ensures mathematical exactness.

3. **ARC-4/uint64 Compatibility:** Algorand's binary format uses 64-bit integers that exceed `Number.MAX_SAFE_INTEGER`.

4. **API Consistency:** `DataView.getBigUint64()` returns `bigint`, so all related types must match.

**Examples in ProofVote:**
```typescript
// All blockchain values use bigint
type VoteState = {
  startAt: bigint;          // Unix timestamp (may exceed MAX_SAFE_INTEGER in future)
  stake: bigint;            // microALGO amounts (can be very large)
  optionCount: bigint;      // Consistency with other fields
};

// Mock data maintains same types
const mock = {
  stake: 1_000_000n,        // 1 ALGO in microALGO
  optionCount: 3n,          // Must be bigint to match VoteState type
};
```

This is industry standard across all blockchain ecosystems (Ethereum's ethers.js, Solana's BN, etc.).

---

## Project Structure

```
proofvote/
├── contracts/           ← TEALScript smart contract + tests + deploy
│   └── README.md        ← contract API, MBR calculations, commands
├── web/                 ← Next.js app + API routes + Prisma
│   └── README.md        ← env vars, commands, page rendering table
├── docs/
│   ├── plan-en.md       ← implementation plan (English)
│   └── plan-pl.md       ← implementation plan (Polish)
├── package.json         ← npm workspaces root + scripts
└── vercel.json          ← Vercel build command override
```
