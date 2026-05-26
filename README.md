# ProofVote

On-chain polling platform built on Algorand. Create polls, vote with your wallet, and get your stake back after the poll ends. One wallet = one vote — enforced by the smart contract.

---

## Contents

- [What is ProofVote?](#what-is-proofvote)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Glossary](#glossary)
- [Quickstart](#quickstart)
- [Workspace Scripts](#workspace-scripts)
- [How Voting Works](#how-voting-works)
- [The Smart Contract Explained](#the-smart-contract-explained)
- [Architecture](#architecture)
- [How It Works — Technical](#how-it-works--technical)
  - [On-chain interaction — ATC builder pattern](#on-chain-interaction--atc-builder-pattern)
  - [Off-chain authentication — signature verification](#off-chain-authentication--signature-verification)
- [Testing](#testing)
- [Development Notes](#development-notes)
  - [Why BigInt instead of Number?](#why-bigint-instead-of-number)
  - [TEALScript gotchas](#tealscript-gotchas)

---

## What is ProofVote?

ProofVote is a polling platform where every vote requires a small, refundable deposit (called a **stake**). This deposit — along with a tiny storage fee for your on-chain vote record — is locked by a smart contract on the Algorand blockchain and returned to you in full after the poll ends.

**Why a deposit?**
- It prevents spam and bot voting — creating hundreds of fake wallets costs real money
- It gives every voter genuine "skin in the game"
- It proves your vote was intentional

**What happens to your money?**
Your stake is never at risk of being lost or stolen. It is held by the smart contract — not by ProofVote, not by the poll creator — and returned to your wallet after voting ends. The small storage deposit (MBR) paid when your vote record is created is also returned at the same time. You have a withdraw time window to claim both back. After that window, unclaimed funds can be swept by the platform.

The one cost that is **not** refunded is the Algorand transaction fee: a flat ~0.001 ALGO per transaction. This is paid to the network validators, not to ProofVote, and applies to every Algorand transaction regardless of the app.

**Why blockchain?**
Vote counts are stored directly on the Algorand blockchain and cannot be altered or deleted. This means:
- Results are publicly verifiable by anyone — no trust required
- Nobody can manipulate — votes can only be added, never removed or changed

---

## Project Structure

```
proofvote/
├── contracts/           ← TEALScript smart contract + tests + deploy
├── web/                 ← Next.js app + API routes + Prisma
├── package.json         ← npm workspaces root + scripts
└── vercel.json          ← Vercel build command override
```

---

## Tech Stack

| Layer              | Technology                  | Rationale                                                          |
| ------------------ | --------------------------- | ------------------------------------------------------------------ |
| Smart contract     | TEALScript (Algorand AVM)   | Type-safe TS → TEAL; ARC-4/ARC-56 ABI out of the box               |
| Wallet integration | @txnlab/use-wallet-react v4 | Supports Pera, Defly, WalletConnect; handles signer plumbing       |
| Frontend           | Next.js 16 (App Router)     | SSR for SEO on poll list; client components for wallet interaction |
| UI components      | shadcn/ui + Tailwind CSS    | Accessible, composable; no runtime overhead                        |
| Database ORM       | Prisma 6 + MySQL            | Type-safe queries; migrations via Prisma                          |
| Validation         | Zod 4                       | Schema-first API validation with TypeScript inference              |
| Rate limiting      | In-memory sliding window    | Simple; no external dependency                                     |
| Deployment         | Vercel                      | Zero-config Next.js; env vars via dashboard                        |

---

## Glossary

For developers new to blockchain or the Algorand ecosystem:

| Term | Description |
|------|-------------|
| **Algorand** | Layer-1 blockchain with instant finality (~3.5 s) and low fees (~0.001 ALGO). Uses Pure Proof-of-Stake consensus. |
| **ALGO** | Native cryptocurrency of Algorand. Used for transaction fees and staking. |
| **microALGO (µALGO)** | Smallest unit of ALGO. 1 ALGO = 1,000,000 µALGO (like cents to a dollar). |
| **Stake / deposit** | ALGO locked by the contract when you vote. Returned to you after the poll ends, within the withdrawal window. |
| **Smart contract** | Self-executing code stored on the blockchain. In Algorand, compiled to TEAL bytecode. Nobody can modify the rules after deployment, though data stored in the contract (boxes, state) can be created or deleted according to those rules. |
| **TEAL** | Transaction Execution Approval Language — Algorand's smart contract language (low-level, assembly-like). |
| **TEALScript** | TypeScript library that compiles to TEAL. Write smart contracts using TypeScript syntax and TEALScript's types/classes — the compiler transforms them into TEAL bytecode. |
| **AVM** | Algorand Virtual Machine — executes TEAL bytecode on every node simultaneously. |
| **ABI** | A JSON file generated at contract build time that describes its methods — what to call and with which arguments. |
| **ARC-4** | Algorand standard that defines how to encode arguments into bytes when calling a contract. |
| **Box storage** | Named on-chain key-value slots in Algorand contracts. Persistent between transactions; each box costs a small MBR deposit. |
| **MBR** | Minimum Balance Requirement — ALGO locked when creating an account or a storage box. Acts like a refundable storage deposit; returned when the box is deleted. |
| **Atomic group** | A set of transactions submitted together. Either all succeed or all are rejected — no partial execution. Prevents payment without contract call (and vice versa). |
| **algod** | Algorand node daemon. Provides an HTTP API for reading blockchain state and submitting transactions. |
| **LocalNet** | A local Algorand node running on your machine (via AlgoKit). Instant finality, no real ALGO needed — used for development and contract testing. |
| **TestNet** | A test network with free ALGO for development. Separate from MainNet; no real monetary value. |
| **MainNet** | The production Algorand network. All ALGO has real monetary value. |

---

## Quickstart

### 1. Clone and install

Recommended Node.js version: **24.13.1** (see `.nvmrc`).
If you use [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm use   # picks up .nvmrc automatically
```

```bash
git clone https://github.com/sebastiangolab/proof-vote-algorand.git
cd proof-vote-algorand
npm install
```

### 2. Configure environment

```bash
cp web/.env.example web/.env
```

All variables are documented in [web/.env.example](web/.env.example).

> **Mock mode:** when `NEXT_PUBLIC_APP_ID=0`, on-chain fetches return hardcoded fixture data. The database still works normally. Useful for frontend development without a deployed contract.

### 3. Set up the database

```bash
cd web
npx prisma migrate dev --name init   # create tables (requires shadow DB)
# or, for CyberFolks / managed MySQL without shadow DB:
npx prisma db push                   # sync schema directly
npx prisma generate                  # re-generate Prisma client after schema changes
npx prisma studio                    # open visual DB browser (optional)
```

### 4. Build the smart contract

Contract build artifacts are not included in the repository — generate them before deploying or running contract tests:

```bash
npm run build:contracts                          # with algod verification (requires LocalNet running)

# or, without a local Algorand node:
npm run build:no-algod --workspace=contracts     # no verification, works anywhere
```

Both commands produce identical artifacts. The target network (LocalNet / TestNet / MainNet) is set at deploy time via `.env`, not at build time.

### 5. Deploy the contract

Copy and fill in the contracts environment file:

```bash
cp contracts/.env.example contracts/.env
```

#### LocalNet

Start the local node first:

```bash
algokit localnet start
```

Set in `contracts/.env`:

```
ALGOD_SERVER=http://localhost
ALGOD_PORT=4001
ALGOD_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

> **Getting a deployer mnemonic:** LocalNet ships with pre-funded accounts. Export a mnemonic from one of them:
> ```bash
> algokit goal account list                     # pick any address from the output
> algokit goal account export -a <ADDRESS>      # prints the 25-word mnemonic
> ```
> Paste it as `DEPLOYER_MNEMONIC` in `contracts/.env`. No external wallet needed.
>
> **Platform owner features:** The deployer address automatically becomes `platformOwner` in the contract. If you want to use owner-only features in the web UI (e.g. the sweep panel in **My Refunds**), 
> the platform owner key must be available in KMD so the wallet can sign those transactions. 
> Using a KMD account as the deployer guarantees this — the account is already in KMD and will appear in the wallet picker.

#### TestNet

Fund your deployer wallet with free test ALGO from the [dispenser](https://bank.testnet.algorand.network), then set deployer mnemonic words in `contracts/.env`:

```
ALGOD_SERVER=https://testnet-api.algonode.cloud
ALGOD_PORT=443
ALGOD_TOKEN=
DEPLOYER_MNEMONIC=<your 25-word wallet mnemonic>
```

Resources: 
[Explorer](https://testnet.explorer.perawallet.app)
[Dispenser](https://bank.testnet.algorand.network)

Algod: `https://testnet-api.algonode.cloud`

#### MainNet

> **Warning:** deployment costs real ALGO. Only do this for production.

Set in `contracts/.env`:

```
ALGOD_SERVER=https://mainnet-api.algonode.cloud
ALGOD_PORT=443
ALGOD_TOKEN=
DEPLOYER_MNEMONIC=<your 25-word wallet mnemonic>
```

Run the deploy script:

```bash
npm run deploy:contracts
```

After a successful deploy, the script prints:
```
Deployer address : RZPP6...FNIQ
APP_ID           : 123456789
APP_ADDRESS      : ABCDE...XYZ
```

Copy the values to `web/.env`:
```
NEXT_PUBLIC_APP_ID=<printed APP_ID>
NEXT_PUBLIC_ALGORAND_NETWORK=<testnet|mainnet|localnet>
NEXT_PUBLIC_PLATFORM_OWNER_ADDRESS=<printed Deployer address>
```

All variables are documented in [contracts/.env.example](contracts/.env.example).

### Deployment costs

Deploying requires approximately **~0.453 ALGO** upfront: ~0.103 ALGO in fees and seed payment (permanent), and ~0.35 ALGO locked as MBR in the deployer account.

### 6. Start the dev server

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
npm run deploy:contracts # Deploy the contract to the configured network
npm run test:contracts   # Contract unit tests (requires LocalNet)
npm run test:all         # contracts + web tests
npm run lint             # ESLint (web/ + contracts/)
npm run format           # Prettier — format all files
npm run prisma:studio    # Open visual DB browser at http://localhost:5555
```

---

## How Voting Works

### Step 1 — Create a poll

A poll creator submits a transaction to the smart contract specifying the question, options (2–8), and end time. They also pay a small deposit to reserve storage space on-chain. The required stake per vote and the withdrawal window are set globally by the platform and cannot be modified by the poll creator.

The contract assigns an auto-incrementing poll ID and stores everything in **box storage** (Algorand's persistent on-chain key-value store). The poll metadata — title, description, option labels — is stored off-chain in a database and linked to the on-chain poll by its ID.

### Step 2 — Vote

To vote, a user submits two transactions together in a single atomic group:

1. A **payment** to the contract — the required stake plus a small storage deposit (both refundable after the poll ends)
2. A **contract call** specifying which option they chose

Each of the two transactions carries a standard Algorand network fee (~0.001 ALGO), so the total non-refundable cost is ~0.002 ALGO — paid to network validators, not to ProofVote.

The contract checks:
- Is the poll open (before `endAt`)?
- Has this wallet already voted on this poll?
- Is the payment amount exactly correct?

If any check fails, the entire group is rejected — including the payment, so no ALGO is lost. If it succeeds, the contract records the vote and locks the stake.

**One wallet = one vote.** Duplicate votes are impossible: the contract stores a record per `(pollId, walletAddress)` pair, and creating it a second time is rejected outright.

### Step 3 — Poll ends

Once the `endAt` timestamp passes, no more votes can be cast. The results — exact vote counts per option — are permanently recorded on-chain and visible to anyone via a blockchain explorer.

### Step 4 — Claim your stake back

After the poll ends, voters have a withdrawal window to reclaim their stake. The contract:

1. Verifies the caller actually voted and hasn't already withdrawn
2. Deletes the vote record (this is the double-withdrawal protection)
3. Sends back `stake + storage deposit` to the caller's wallet

After the withdrawal deadline, the platform owner may sweep unclaimed stakes.

---

## The Smart Contract Explained

> Think of the smart contract as an **automated safe with hardcoded rules**. The safe accepts deposits, enforces voting rules, and releases funds — and nobody, not even the platform owner or the poll creator, can override those rules or touch another user's money during an active poll.

The contract is written in [TEALScript](https://github.com/algorandfoundation/tealscript) (TypeScript that compiles to Algorand bytecode) and lives at [contracts/src/ProofVote.algo.ts](contracts/src/ProofVote.algo.ts).

### What does a TEALScript contract look like?

```typescript
import { Contract } from '@algorandfoundation/tealscript';

// Every TEALScript contract is a TypeScript class extending Contract.
// It compiles to TEAL bytecode that runs on the Algorand Virtual Machine.
class Counter extends Contract {
  // Global state — stored on-chain, persists between transactions.
  // Reserving space costs a small ALGO deposit (MBR).
  count = GlobalStateKey<uint64>();

  // Called once when the contract is deployed.
  createApplication(): void {
    this.count.value = 0;
  }

  // A public method — anyone can call it by sending a transaction to this contract.
  increment(): void {
    this.count.value = this.count.value + 1;
  }

  // assert() rejects the entire transaction if the condition is false.
  // No partial execution — either everything succeeds or nothing does.
  incrementBy(amount: uint64): void {
    assert(amount > 0, 'amount must be positive');
    this.count.value = this.count.value + amount;
  }
}
```

### Global state — the contract's settings

When the contract is deployed, seven values are stored permanently on-chain:

| Key | What it is |
|-----|-----------|
| `platformOwner` | The address that deployed the contract |
| `defaultStake` | Suggested stake amount shown in the UI (1 ALGO) |
| `minStake` / `maxStake` | Allowed stake range (0.5–10 ALGO) |
| `defaultWithdrawWindow` | Default refund window (7 days) |
| `nextVoteId` | Auto-incrementing counter; first poll gets ID 1 |
| `disabled` | 0 = active, 1 = disabled; set once by `platformOwner` — cannot be undone |

These act like "factory settings" — they are set once at deployment and can only be changed by `platformOwner`.

### Box storage — the contract's filing cabinet

Each poll and each individual vote record is stored in its own **box** (a named slot in Algorand's on-chain storage). Think of boxes as labeled drawers in a filing cabinet:

- **Poll box** — keyed by `voteId`
- **User vote box** — keyed by `(voteId, walletAddress)`

Creating a box requires a small deposit (**MBR** — Minimum Balance Requirement), similar to a security deposit for renting a storage drawer. The deposit is returned when the box is deleted (on withdrawal or sweep).

### Contract methods in app

| Method | Caller | Description |
|--------|--------|-------------|
| `createApplication(defaultStake, minStake, maxStake, defaultWithdrawWindow)` | Deployer | Initialize global state; deployer becomes `platformOwner` |
| `createVote(endAt, optionCount, stake, mbrPayment)` | Anyone | Create a new poll; returns `voteId` |
| `vote(voteId, choice, payment)` | Any wallet | Cast a vote; must be in atomic group with PayTxn before AppCall |
| `withdraw(voteId)` | Voter | Reclaim stake after poll ends (within withdrawal window) |
| `sweepUser(voteId, user)` | `platformOwner` | Sweep unclaimed stake after the withdrawal deadline |
| `updatePlatformOwner(newOwner)` | `platformOwner` | Transfer platform ownership to a new address |
| `disable()` | `platformOwner` | Irreversibly disable the contract; blocks `createVote` and `vote` but leaves `withdraw` and `sweepUser` callable so users can recover funds |

---

## Architecture

```
┌─────────────┐        sign txn              ┌──────────────────┐
│  Pera/Defly │ ◄──────────────────────────► │  Next.js (Vercel)│
│   Wallet    │                              │  web/            │
└─────────────┘                              └────────┬─────────┘
                                                      │
                                         ┌────────────┴──────────────┐
                                         │                           │
                                  ┌──────▼───────┐          ┌────────▼───────┐
                                  │   Algorand   │          │  MySQL         │
                                  │  (algod via  │          │  VoteMetadata  |
                                  │   AlgoNode)  │          │  (Prisma)      |
                                  │              │          │                │
                                  └──────────────┘          └────────────────┘
```

**Why two storage layers?**

On-chain storage is expensive and size-limited. The rule of thumb: store what must be trustless and immutable on-chain; store what's just metadata off-chain.

- **On-chain (Algorand):** vote counts, stakes, wallet addresses, timestamps — the data that must be tamper-proof
- **Off-chain (MySQL):** poll title, description, option labels, URL slug — readable text that doesn't need blockchain guarantees

---

## How It Works — Technical

### On-chain interaction — ATC builder pattern

Every smart contract method has a corresponding builder function in `web/lib/contract-client.ts`. The `AtomicTransactionComposer` (ATC) groups the payment and the contract call into a single atomic group
if the contract call fails for any reason, the payment is also rolled back. No ALGO is lost.

Each builder function:

1. Fetches current network parameters from algod (`getTransactionParams`)
2. Constructs any required payment transaction (MBR cover, stake deposit)
3. Adds the ABI method (`vote`, `withdraw` ...) call to an `AtomicTransactionComposer`
4. Returns the configured ATC — the caller executes it with `.execute(algod, 4)`

```
contract-client.ts          ProofVote contract (on-chain)
──────────────────          ─────────────────────────────
buildCreateVoteAtc()   →    createVote(endAt, optionCount, stake, pay)
buildVoteAtc()         →    vote(voteId, choice, pay)
buildWithdrawAtc()     →    withdraw(voteId)
buildBatchWithdrawAtc()→    withdraw(voteId) × N   (up to 16 in one atomic group)
buildSweepUserAtc()    →    sweepUser(voteId, userAddress)
buildBatchSweepAtc()   →    sweepUser(voteId, userAddress) × N
```

**Why PayTxn before AppCall?**
PayTxn funds the contract; AppCall is the logic that uses those funds. The contract requires a payment (stake + MBR) to create the vote box — without it, the contract has no funds to cover the storage cost and will reject the call. Per the ARC-4 convention, the contract finds the payment by looking at the transaction directly before the AppCall in the group, so the PayTxn must always be added first.

**Box references**
Methods that read or write box storage must declare which boxes they'll access. Each builder supplies the correct box refs (`generateVoteBoxName`, `generateUserVoteBoxName`) so the AVM can pre-load them.

---

### Off-chain authentication — signature verification

Poll metadata is stored off-chain in MySQL and submitted to the Next.js API after the on-chain `createVote` call. Without authentication, anyone could register metadata for a voteId they didn't create.

**The problem:** the API cannot call algod to check "who created this vote" cheaply for every request.

**The solution:** the vote creator signs a canonical message with their wallet before submitting metadata. The API verifies that signature server-side.

```
┌──────────────┐  1. createVote tx   ┌──────────────────┐
│  Browser /   │ ─────────────────►  │  Algorand        │
│  Wallet      │ ◄─────────────────  │  (returns voteId)│
└──────┬───────┘  2. voteId          └──────────────────┘
       │
       │  3. sign a 0-ALGO self-payment with message as note
       │     → signed transaction bytes (base64)
       │
       │  4. POST /api/votes  { voteId, slug, title, ..., creatorWallet, signature }
       ▼
┌──────────────┐  5. verify Ed25519 signature (Web Crypto API)
│  Next.js API │  6. if valid → INSERT into MySQL
└──────────────┘     else → 401 Unauthorized
```

**Canonical message format:**
```
ProofVote: create metadata for appId=<A> voteId=<N> slug=<Y>
```

The message binds the signature to a specific `(appId, voteId, slug)` triple. Replaying a signature for a different voteId, slug, or contract deployment will fail verification. Including `appId` prevents cross-deployment replay: a valid signature from one deployed instance cannot be reused against a re-deployed contract with a new App ID.

**Signing method**

The creator signs a 0-ALGO self-payment transaction with the canonical message in the `note` field. The transaction is **never submitted to the network** — it serves solely as a signing primitive that all wallets support. The backend decodes the signed transaction bytes and verifies the Ed25519 signature via the Web Crypto API.

Neither the signature nor the transaction is stored in the database — they are used only for the one-time ownership proof.

---

## Testing

### Level 1 — Contract tests (requires LocalNet)

LocalNet is a fully offline Algorand node that runs on your machine with instant finality — no real ALGO needed.

```bash
algokit localnet start        # start the local blockchain node
npm run build:contracts       # compile TEALScript → TEAL
npm run test:contracts        # run contract unit tests
```

### Level 2 — Web app tests

```bash
npm run test           # Jest: unit + integration tests (web/)
```

### Level 3 — Manual testing

#### LocalNet

Recommended for development — offline, instant finality, no real ALGO needed.

1. `algokit localnet start`
2. Deploy the contract (see [Step 5 → LocalNet](#localnet-1))
3. `npm run dev` → open http://localhost:3000
4. Connect a wallet configured for LocalNet
5. Create a poll → cast a vote → verify results in the LocalNet explorer
6. Withdraw or sweep

#### TestNet

Closer to production — free test ALGO from the dispenser, no real risk.

1. Deploy the contract (see [Step 5 → TestNet](#testnet-1))
2. `npm run dev` → open http://localhost:3000
3. Connect a Pera or Defly wallet set to **TestNet**
4. Get free TestNet ALGO from the [dispenser](https://bank.testnet.algorand.network)
5. Create a poll → cast a vote → verify results in the [TestNet explorer](https://testnet.explorer.perawallet.app)
6. Withdraw or sweep

#### MainNet

Production environment — real ALGO, real consequences. Follow the same steps as TestNet but use the MainNet deploy configuration (see [Step 5 → MainNet](#mainnet)) and switch your wallet to **MainNet**.

> **Mock mode:** set `NEXT_PUBLIC_APP_ID=0` in `web/.env` to run the UI without a deployed contract. On-chain data is replaced with hardcoded fixtures; the database still works normally. Useful for frontend development and API route testing without deploying to any network.

### Resetting between test runs (LocalNet)

Different levels of reset depending on what you changed:

#### 1. Reset only the chain (new LocalNet from scratch)

Use when: you want a clean slate on-chain (new accounts, no old votes/apps), but haven't changed the contract code.

```bash
algokit localnet reset          # wipes all chain state and restarts LocalNet
npm run deploy:contracts        # deploy a fresh contract instance
```

Then update `NEXT_PUBLIC_APP_ID` in `web/.env` with the new `APP_ID`.

#### 2. Reset only the database (Prisma)

Use when: the chain is fine, but the DB has stale vote records from a previous run (e.g. votes pointing to an old `APP_ID`).

Open Prisma Studio and delete rows manually:
```bash
npm run prisma:studio            # opens http://localhost:5555
```

Or wipe all rows via the DB directly if you want a full clean state.

#### 3. Rebuild the contract after code changes

Use when: you edited `contracts/src/ProofVote.algo.ts` or any contract source.

```bash
npm run build:contracts          # recompile TEAL → artifacts/
npm run deploy:contracts         # deploy the new version (new APP_ID!)
```

After redeploying, always update `NEXT_PUBLIC_APP_ID` in `web/.env`.

#### Typical full reset sequence

```bash
algokit localnet reset
npm run build:contracts
npm run deploy:contracts
# update web/.env with new APP_ID
# clear DB records via prisma:studio if needed
npm run dev
```

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

### TEALScript gotchas

1. **StaticArray in struct** — cannot mutate in-place through a box reference; read → modify → write back:

   `this.votes(id).value` reads the entire struct from the box — but the result is a **copy**, not a pointer to on-chain memory. Assigning to `.counts[i]` modifies that local copy and the write never propagates back to the box.

   ```typescript
   // ❌ WRONG
   this.votes(id).value.counts[i] += 1;
   
   // ✅ CORRECT
   const s = this.votes(id).value;
   s.counts[i] = s.counts[i] + 1;
   this.votes(id).value = s;
   ```

   ProofVote uses `extract3`/`replace3` for a more efficient in-place byte update — see `vote()` in [contracts/src/ProofVote.algo.ts](contracts/src/ProofVote.algo.ts).

2. **Box refs in client** — every box touched by the contract must be declared in `boxes: BoxReference[]` when building ATC method calls. Missing a declaration causes the transaction to be rejected by the AVM.

3. **Return value extraction** — after `atc.execute()`:

   ```typescript
   const voteId = result.methodResults[0].returnValue; // ABI-decoded uint64
   ```

4. **PayTxn ordering** — the PayTxn must be added to the atomic group **before** the AppCall. Pass it as a `TransactionWithSigner` in `methodArgs`.
