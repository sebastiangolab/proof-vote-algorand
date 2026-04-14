# ProofVote

On-chain polling platform built on Algorand. Create polls, vote with your wallet, and get your stake back after the poll ends. One wallet = one vote — enforced by the smart contract, not by a database.

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
  - [Contract deployment](#contract-deployment--contractsdeploydeployts)
- [Algorand Networks](#algorand-networks)
- [Testing](#testing)
- [Development Notes](#development-notes)
  - [Why BigInt instead of Number?](#why-bigint-instead-of-number)
  - [TEALScript gotchas](#tealscript-gotchas)

---

## What is ProofVote?

ProofVote is a polling platform where every vote requires a small, refundable deposit (called a **stake**). This deposit is locked by a smart contract on the Algorand blockchain and returned to you after the poll ends.

**Why a deposit?**
- It prevents spam and bot voting — creating hundreds of fake wallets costs real money
- It gives every voter genuine "skin in the game"
- It proves your vote was intentional

**What happens to your money?**
Your stake is never at risk of being lost or stolen. It is held by the smart contract — not by ProofVote, not by the poll creator — and returned to your wallet after voting ends. You have a 7-day window to claim it back. After that window, unclaimed stakes can be swept by the platform.

The one cost that is **not** refunded is the Algorand transaction fee: a flat ~0.001 ALGO per transaction. This is paid to the network validators, not to ProofVote, and applies to every Algorand transaction regardless of the app.

**Why blockchain?**
The vote counts and every individual vote record are stored directly on the Algorand blockchain. This means:
- Results are publicly verifiable by anyone — no trust required
- Nobody can edit or delete vote records after they are cast
- The rules are enforced by code, not by a company

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
| Monorepo tooling   | AlgoKit + npm workspaces    | Standard Algorand dev environment; contracts and web share types   |
| Wallet integration | @txnlab/use-wallet-react v4 | Supports Pera, Defly, WalletConnect; handles signer plumbing       |
| Frontend           | Next.js 16 (App Router)     | SSR for SEO on poll list; client components for wallet interaction |
| UI components      | shadcn/ui + Tailwind CSS    | Accessible, composable; no runtime overhead                        |
| Database ORM       | Prisma 6 + MySQL            | Type-safe queries; CyberFolks provides managed MySQL               |
| Validation         | Zod 4                       | Schema-first API validation with TypeScript inference              |
| Rate limiting      | In-memory sliding window    | Simple; acceptable for low-traffic TestNet MVP                     |
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
| **Smart contract** | Self-executing code stored on the blockchain. In Algorand, compiled to TEAL bytecode. Nobody can modify the rules after deployment. |
| **TEAL** | Transaction Execution Approval Language — Algorand's smart contract language (low-level, assembly-like). |
| **TEALScript** | TypeScript-to-TEAL compiler. Write contracts in TypeScript, compile to TEAL. Used in this project. |
| **AVM** | Algorand Virtual Machine — executes TEAL bytecode on every node simultaneously. |
| **ABI** | A JSON file generated at contract build time that describes its methods — what to call and with which arguments. |
| **ARC-4** | Algorand standard that defines how to encode arguments into bytes when calling a contract. |
| **Box storage** | Named on-chain key-value slots in Algorand contracts. Persistent between transactions; each box costs a small MBR deposit. |
| **MBR** | Minimum Balance Requirement — ALGO locked when creating an account or a storage box. Acts like a refundable storage deposit; returned when the box is deleted. |
| **Escrow** | A smart contract that holds funds on behalf of participants until predefined conditions are met. ProofVote's contract acts as an escrow for voter stakes. |
| **Atomic group** | A set of transactions submitted together. Either all succeed or all are rejected — no partial execution. Prevents payment without contract call (and vice versa). |
| **algod** | Algorand node daemon. Provides an HTTP API for reading blockchain state and submitting transactions. |
| **Address** | 58-character string identifying an Algorand account (e.g., `MDV4NQNW6...Y4YVLDPLAY`). |
| **Wallet** | App that stores private keys and signs transactions. Examples: Pera, Defly. |
| **TestNet** | A test network with free ALGO for development. Separate from MainNet; no real monetary value. |
| **MainNet** | The production Algorand network. All ALGO has real monetary value. |
| **Poll creator** | The wallet that called `createVote`. They set the parameters but have no special power over votes or funds once the poll is live. |
| **Platform owner** | The address that deployed the contract. Can sweep unclaimed stakes after the withdrawal deadline, and transfer ownership. Cannot touch stakes during the withdrawal window. |
| **Signer** | Wallet function that cryptographically signs a transaction or message with the user's private key. |

---

## Quickstart

### 1. Clone and install

Recommended Node.js version: **24.13.1** (see `.nvmrc`).
If you use [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm use   # picks up .nvmrc automatically
```

```bash
git clone <repo-url>
cd proofvote
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

**Before deploying to LocalNet** — start the local node first:
```bash
algokit localnet start
```

**Before deploying to TestNet** — fund your deployer wallet with free test ALGO from the [dispenser](https://bank.testnet.algorand.network).

> **MainNet warning:** deployment costs real ALGO. Only do this for production.

```bash
cp contracts/.env.example contracts/.env
# Fill in DEPLOYER_MNEMONIC and set ALGOD_SERVER/ALGOD_PORT/ALGOD_TOKEN for the target network:
#   TestNet  → ALGOD_SERVER=https://testnet-api.algonode.cloud  ALGOD_PORT=443
#   MainNet  → ALGOD_SERVER=https://mainnet-api.algonode.cloud  ALGOD_PORT=443
#   LocalNet → ALGOD_SERVER=http://localhost  ALGOD_PORT=4001 ALGOD_TOKEN=aaa...
npm run build:contracts
npm run deploy --workspace=contracts
```

After a successful deploy, copy the printed values to `web/.env`:
```
NEXT_PUBLIC_APP_ID=<printed APP_ID>
NEXT_PUBLIC_PLATFORM_OWNER_ADDRESS=<your deployer wallet address>
NEXT_PUBLIC_ALGORAND_NETWORK=<testnet|mainnet|localnet>
```

All variables are documented in [contracts/.env.example](contracts/.env.example).

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
npm run test:contracts   # Contract unit tests (requires LocalNet)
npm run test:all         # contracts + web tests
```

---

## How Voting Works

### Step 1 — Create a poll

A poll creator submits a transaction to the smart contract specifying the question, options (2–8), and start/end time. They also pay a small deposit to reserve storage space on-chain. The required stake per vote and the withdrawal window are set globally by the platform and cannot be modified by the poll creator.

The contract assigns an auto-incrementing poll ID and stores everything in **box storage** (Algorand's persistent on-chain key-value store). The poll metadata — title, description, option labels — is stored off-chain in a database and linked to the on-chain poll by its ID.

### Step 2 — Vote

To vote, a user submits two transactions together in a single atomic group:

1. A **payment** to the contract — the required stake plus a small storage deposit (both refundable after the poll ends)
2. A **contract call** specifying which option they chose

Each of the two transactions carries a standard Algorand network fee (~0.001 ALGO), so the total non-refundable cost is ~0.002 ALGO — paid to network validators, not to ProofVote.

The contract checks:
- Is the poll open (between `startAt` and `endAt`)?
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

When the contract is deployed, six values are stored permanently on-chain:

| Key | What it is |
|-----|-----------|
| `platformOwner` | The address that deployed the contract |
| `defaultStake` | Suggested stake amount shown in the UI (1 ALGO) |
| `minStake` / `maxStake` | Allowed stake range (0.5–10 ALGO) |
| `defaultWithdrawWindow` | Default refund window (7 days) |
| `nextVoteId` | Auto-incrementing counter; first poll gets ID 1 |

These act like "factory settings" — they are set once at deployment and can only be changed by `platformOwner`.

### Box storage — the contract's filing cabinet

Each poll and each individual vote record is stored in its own **box** (a named slot in Algorand's on-chain storage). Think of boxes as labeled drawers in a filing cabinet:

- **Poll box** — keyed by `voteId`, stores: creator address, start/end times, stake amount, withdrawal deadline, option count, and vote counts (one uint64 per option, up to 8)
- **User vote box** — keyed by `(voteId, walletAddress)`, stores: voted flag, withdrawn flag, which option was chosen, and how much stake is locked

Creating a box requires a small deposit (**MBR** — Minimum Balance Requirement), similar to a security deposit for renting a storage drawer. The deposit is returned when the box is deleted (on withdrawal or sweep).

**Why box storage and not local state (the older approach in Algorand)?**
Local state is stored inside each voter's own account record on-chain. Before interacting with the contract, every user would have to send a separate opt-in transaction to explicitly reserve that space in their account. Box storage works the other way around — data lives in the contract's account, keyed by arbitrary bytes (e.g. `voteId + walletAddress`). No per-user setup is needed: any wallet can vote in a single step.

### Contract methods in app

| Method | Caller | Description |
|--------|--------|-------------|
| `createApplication(defaultStake, minStake, maxStake, defaultWithdrawWindow)` | Deployer | Initialize global state; deployer becomes `platformOwner` |
| `createVote(startAt, endAt, optionCount, stake, withdrawWindow, mbrPayment)` | Anyone | Create a new poll; returns `voteId` |
| `vote(voteId, choice, payment)` | Any wallet | Cast a vote; must be in atomic group with PayTxn before AppCall |
| `withdraw(voteId)` | Voter | Reclaim stake after poll ends (within withdrawal window) |
| `sweepUser(voteId, user)` | `platformOwner` | Sweep unclaimed stake after the withdrawal deadline |
| `updatePlatformOwner(newOwner)` | `platformOwner` | Transfer platform ownership to a new address |

#### `createVote` — opens a new poll

The contract validates the inputs before storing anything:

```typescript
// Reject bad parameters before writing anything to storage
assert(endAt > startAt, "endAt must be after startAt");
assert(optionCount >= 2, "at least 2 options required");
assert(optionCount <= 8, "at most 8 options allowed");
assert(stake >= this.minStake.value, "stake below minimum");
assert(stake <= this.maxStake.value, "stake above maximum");
assert(withdrawWindow >= MIN_WITHDRAW_WINDOW, "withdraw window too short");
```

After validation, it creates the poll box, assigns the next available ID, and returns it to the caller.

#### `vote` — casts a vote and locks the stake

One wallet, one vote — enforced by the box existence check:

```typescript
// A second vote from the same wallet is impossible —
// the box already exists, and creating it again is rejected
assert(!this.userVotes(userVoteKey).exists, "already voted");

// The contract verifies the payment is exactly correct
verifyPayTxn(payment, {
  receiver: this.app.address,
  amount: voteState.stake + USER_VOTE_BOX_MBR,
});
// Note: transaction fees (~0.001 ALGO per transaction) are NOT included in this amount.
// Algorand deducts fees automatically from the sender's account balance — they never
```

After storing the vote record, it increments the vote count for the chosen option in the poll box. Rather than reading the entire poll record, modifying it, and writing it all back, only the relevant 8 bytes are updated — which is more efficient.

#### `withdraw` — refunds the stake after the poll ends

The caller can only withdraw within the withdrawal window, and only once:

```typescript
// Only allowed after the poll ends, before the deadline
assert(globals.latestTimestamp >= voteState.endAt, "voting not ended");
assert(globals.latestTimestamp <= voteState.withdrawDeadline, "withdrawal window closed");

// Deleting the box is the double-withdrawal guard:
// if the box doesn't exist, withdraw() will fail at the .exists check above.
this.userVotes(userVoteKey).delete();

// Refund: original stake + the storage deposit for the user box
sendPayment({
  receiver: this.txn.sender,
  amount: stakeLocked + USER_VOTE_BOX_MBR,
});
```

#### `sweepUser` — collects unclaimed stakes after the deadline

Only `platformOwner` can call this, and only after the withdrawal window has closed:

```typescript
// Restricted to the platform operator
assert(this.txn.sender === this.platformOwner.value, "not platform owner");
// Can only run after users' self-withdrawal window has expired
assert(globals.latestTimestamp > voteState.withdrawDeadline, "withdrawal window not closed");
```

This prevents the platform from sweeping funds while users still have the right to claim them.

#### `updatePlatformOwner` — transfers ownership

Transfers platform ownership to a new address. Only the current owner can call this.

---

## Architecture

```
┌─────────────┐     sign txn / signData      ┌──────────────────┐
│  Pera/Defly │ ◄──────────────────────────► │  Next.js (Vercel)│
│   Wallet    │                              │  web/            │
└─────────────┘                              └────────┬─────────┘
                                                      │
                                         ┌────────────┴──────────────┐
                                         │                           │
                                  ┌──────▼───────┐          ┌────────▼───────┐
                                  │   Algorand   │          │  MySQL         │
                                  │   TestNet    │          │  VoteMetadata  |
                                  │  (algod via  │          │  (Prisma)      |
                                  │   AlgoNode)  │          │                │
                                  └──────────────┘          └────────────────┘
```

**Why two storage layers?**

On-chain storage is expensive and size-limited. The rule of thumb: store what must be trustless and immutable on-chain; store what's just metadata off-chain.

- **On-chain (Algorand):** vote counts, stakes, wallet addresses, timestamps — the data that must be tamper-proof
- **Off-chain (MySQL):** poll title, description, option labels, URL slug — readable text that doesn't need blockchain guarantees

### Page rendering

| Route | Strategy | Data source |
|-------|----------|-------------|
| `/` | Static | — |
| `/votes` | SSR | Prisma |
| `/votes/[slug]` | SSR meta + client on-chain | Prisma + algod |
| `/create-poll` | Client | — |
| `/my-stakes` | Client | algod |

---

## How It Works — Technical

### On-chain interaction — ATC builder pattern

Every smart contract method has a corresponding builder function in `web/lib/contract-client.ts`. The `AtomicTransactionComposer` (ATC) groups the payment and the contract call into a single atomic group — if the contract call fails for any reason, the payment is also rolled back. No ALGO is lost.

Each builder function:

1. Fetches current network parameters from algod (`getTransactionParams`)
2. Constructs any required payment transaction (MBR cover, stake deposit)
3. Adds the ABI method (`vote`, `withdraw` ...) call to an `AtomicTransactionComposer`
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

**Why PayTxn before AppCall?**
PayTxn funds the contract; AppCall is the logic that uses those funds. The contract requires a payment (stake + MBR) to create the vote box — without it, the contract has no funds to cover the storage cost and will reject the call. Per the ARC-4 convention, the contract finds the payment by looking at the transaction directly before the AppCall in the group, so the PayTxn must always be added first.

**Box references**
Methods that read or write box storage must declare which boxes they'll access. Each builder supplies the correct box refs (`generateVoteBoxName`, `generateUserVoteBoxName`) so the AVM can pre-load them.

---

### Off-chain authentication — signature verification

Poll metadata (title, description, option labels, URL slug) is stored off-chain in MySQL and submitted to the Next.js API after the on-chain `createVote` call. Without authentication, anyone could register metadata for a voteId they didn't create.

**The problem:** the API cannot call algod to check "who created this vote" cheaply for every request.

**The solution:** the vote creator signs a canonical message with their wallet before submitting metadata. The API verifies that signature server-side.

```
┌──────────────┐  1. createVote tx   ┌──────────────────┐
│  Browser /   │ ─────────────────►  │  Algorand        │
│  Wallet      │ ◄─────────────────  │  (returns voteId)│
└──────┬───────┘  2. voteId          └──────────────────┘
       │
       │  3. wallet.signData("ProofVote: create metadata for appId=A voteId=N slug=Y")
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
ProofVote: create metadata for appId=<A> voteId=<N> slug=<Y>
```

The message binds the signature to a specific `(appId, voteId, slug)` triple. Replaying a signature for a different voteId, slug, or contract deployment will fail verification. Including `appId` prevents cross-deployment replay: a valid signature from one deployed instance cannot be reused against a re-deployed contract with a new App ID.

**Domain separation (`MX` prefix)**
`algosdk.verifyBytes` internally prepends `"MX"` to the message bytes before verification. This prevents a valid Algorand transaction signature from being reused as an arbitrary message signature — a standard protection against signature replay attacks across different contexts.

The signature itself is **not stored** in the database — it is only used for the one-time ownership proof.

---

### Contract deployment — `contracts/deploy/deploy.ts`

Deploys a fresh instance of the ProofVote contract to Algorand and prints the resulting `APP_ID`. Run once per environment (TestNet / MainNet).

```
contracts/
├── artifacts/               ← generated by `npm run build:contracts` (gitignored)
│   ├── ProofVote.approval.teal
│   ├── ProofVote.clear.teal
│   ├── ProofVote.arc32.json
│   └── ProofVote.arc56.json
└── deploy/
    └── deploy.ts            ← this script
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

## Algorand Networks

| Network      | When to use                                                              | Real ALGO? |
| ------------ | ------------------------------------------------------------------------ | ---------- |
| **mainnet**  | Production — real funds, real consequences. Use only for final launch.   | Yes        |
| **testnet**  | Default for development. Free test ALGO from the dispenser. No real risk.| No         |
| **localnet** | Fully offline, instant finality. Requires AlgoKit (`algokit localnet start`). | No    |

### TestNet resources

- Explorer: https://testnet.explorer.perawallet.app
- Dispenser: https://bank.testnet.algorand.network
- Algod (AlgoNode): https://testnet-api.algonode.cloud

---

## Testing

### Level 1 — Contract tests (requires LocalNet)

LocalNet is a fully offline Algorand node that runs on your machine with instant finality — no real ALGO needed.

```bash
algokit localnet start        # start the local blockchain node
npm run build:contracts       # compile TEALScript → TEAL
npm run test:contracts        # run contract unit tests
```

What is tested in [contracts/tests/ProofVote.test.ts](contracts/tests/ProofVote.test.ts):

- **createVote** — valid parameters succeed; invalid stake range, option count, and timing are rejected
- **vote** — one-wallet-one-vote enforcement; out-of-range choice rejection; voting before/after window
- **withdraw** — only after poll ends; only within the withdrawal window; correct refund amount; double-withdrawal rejected
- **sweep** — only by platform owner; only after the withdrawal deadline; correct amount forwarded
- **MBR payments** — each method verifies the attached payment equals the required amount exactly

### Level 2 — Web app tests

```bash
npm run test           # Jest: unit + integration tests (web/)
```

What is tested:

- **API routes** — `POST /api/votes`: Zod validation, signature verification, rate limiting, duplicate detection
- **Algorand decoders** — binary parsing of `VoteState` and `UserVoteState` from on-chain box data
- **Signature verification** — `lib/signatures.ts` canonical message format and `algosdk.verifyBytes` integration
- **Rate limiter** — sliding window logic, cleanup behavior (`lib/rateLimit.ts`)

### Level 3 — Manual testing

**LocalNet** (recommended for development — offline, instant finality, no real ALGO needed):
1. `algokit localnet start`
2. Deploy the contract to LocalNet (see [Step 4](#4-deploy-the-contract))
3. `npm run dev` → open http://localhost:3000
4. Connect a wallet configured for LocalNet
5. Create a poll → cast a vote → verify results in the LocalNet explorer

**TestNet** (closer to production — free test ALGO from the dispenser):
1. `npm run dev` → open http://localhost:3000
2. Connect a Pera or Defly wallet set to **TestNet**
3. Get free TestNet ALGO from the [dispenser](https://bank.testnet.algorand.network)
4. Create a poll → cast a vote → verify results in the [TestNet explorer](https://testnet.explorer.perawallet.app)

> **Mock mode:** set `NEXT_PUBLIC_APP_ID=0` in `web/.env` to run the UI without a deployed contract. On-chain data is replaced with hardcoded fixtures; the database still works normally. Useful for frontend development and API route testing without deploying to any network.

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
