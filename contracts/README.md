# ProofVote — Smart Contract

TEALScript smart contract for stake-backed, one-wallet-one-vote polling on Algorand.

---

## ARC-4 Struct Types

**ARC-4** (Algorand Request for Comments 4) defines how complex data types are encoded and stored on the Algorand blockchain. Understanding ARC-4 is crucial for efficient smart contract design.

### Basic Type Sizes

| Type               | Size (bytes)    | Notes                                      |
| ------------------ | --------------- | ------------------------------------------ |
| `boolean`          | 1               | Can be packed with adjacent booleans       |
| `uint8`            | 1               |                                            |
| `uint16`           | 2               |                                            |
| `uint32`           | 4               |                                            |
| `uint64`           | 8               | Most common integer type                   |
| `Address`          | 32              | Public key (wallet address)                |
| `string`           | variable        | Length-prefixed, padded to 8-byte boundary |
| `StaticArray<T,N>` | `sizeof(T) × N` | Fixed-size array                           |

### Boolean Packing Optimization

ARC-4 can **pack multiple consecutive booleans** into a single byte:

```typescript
// ✅ PACKED (efficient)
type PackedFlags = {
  flag1: boolean; // ⎫
  flag2: boolean; // ⎬ All 4 packed into 1 byte
  flag3: boolean; // ⎭
  flag4: boolean; // ⎭
};

// ❌ NOT PACKED (inefficient)
type UnpackedFlags = {
  flag1: boolean; // 1 full byte
  someNumber: uint64; // ← BREAKS packing
  flag2: boolean; // 1 full byte (separate)
};
```

**Key insight:** Non-boolean fields **break** the packing sequence.

### Storage Cost Impact

Every byte matters on blockchain storage:

```typescript
// 1 byte difference = 400 µALGO difference in MBR!
// MBR = 2500 + 400 × (boxName + boxValue)
```

**Example optimization:** Moving `withdrawn` next to `voted` in `UserVoteState` saved 1 byte per vote, reducing MBR from 26,100 to 25,700 µALGO.

---

## Contract Skeleton

Here's the essential structure of a TEALScript smart contract:

### Basic Template

```typescript
import { Contract } from "@algorandfoundation/tealscript";

// ── ARC-4 Data Types ──────────────────────────────────────

type MyDataType = {
  field1: uint64;
  field2: Address;
  // Pack booleans together for efficiency
  flag1: boolean;
  flag2: boolean;
};

type MyKeyType = {
  id: uint64;
  owner: Address;
};

// ── Smart Contract ───────────────────────────────────────

class MyContract extends Contract {
  // Global state (max 64 keys total)
  owner = GlobalStateKey<Address>();
  counter = GlobalStateKey<uint64>();

  // Box storage (unlimited, but costs MBR)
  data = BoxMap<MyKeyType, MyDataType>({ prefix: "d" });

  // ── Initialization ──────────────────────────────────────

  createApplication(initialValue: uint64): void {
    this.owner.value = this.txn.sender;
    this.counter.value = initialValue;
  }

  // ── Public Methods ──────────────────────────────────────

  myMethod(key: MyKeyType, payment: PayTxn): void {
    // Validate inputs
    assert(this.txn.sender === this.owner.value, "Not authorized");

    // Verify payment for MBR if creating new box
    if (!this.data(key).exists) {
      // Calculate: 2500 + 400 × (keySize + valueSize)
      const mbr = 2500 + 400 * (40 + 42); // example sizes
      verifyPayTxn(payment, {
        receiver: this.app.address,
        amount: mbr,
      });
    }

    // Update state
    this.data(key).value = {
      field1: this.counter.value,
      field2: this.txn.sender,
      flag1: true,
      flag2: false,
    };

    this.counter.value += 1;
  }
}
```

### Key Patterns

1. **Box prefixes** — Use single-character prefixes to organize different data types
2. **MBR calculations** — Always compute exact MBR requirements
3. **Payment verification** — Use `verifyPayTxn()` for MBR and stakes
4. **Assertions** — Validate all inputs with descriptive error messages
5. **Atomic operations** — Group related state changes together

### Box vs Global State

| Storage Type     | Max Items | Per-item Cost         | Use Case                        |
| ---------------- | --------- | --------------------- | ------------------------------- |
| **Global State** | 64 keys   | ~10 µALGO             | Contract config, small counters |
| **Box Storage**  | Unlimited | 2500 + 400×size µALGO | User data, large datasets       |

**Rule of thumb:** Use global state for contract-level settings, boxes for per-user or per-item data.

---

## Architecture

### Design principles

| Principle               | Implementation                                   |
| ----------------------- | ------------------------------------------------ |
| No opt-in required      | Box storage — no local state                     |
| Scalable per-user state | `BoxMap<UserKey, UserVoteState>`                     |
| Stake escrow            | ALGO held in contract; refunded on withdraw      |
| MBR transparency        | Callers pay box MBR explicitly via `PayTxn` args |
| Sweep safety            | Per-user sweep — no iteration over all voters    |

### Contract API

| Method                                                                                | Caller        | Description                                             |
| ------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------- |
| `createApplication(defaultStake, minStake, maxStake, defaultWithdrawWindow)`          | Deployer      | Initialise global state; deployer becomes platformOwner |
| `createVote(startAt, endAt, optionCount, stake, withdrawWindow, mbrPayment)`          | Anyone        | Create a new poll; returns `voteId`                     |
| `vote(voteId, choice, payment)`                                                       | Any wallet    | Cast a vote; atomic group with PayTxn before AppCall    |
| `withdraw(voteId)`                                                                    | Voter         | Reclaim stake after vote ends (within deadline)         |
| `sweepUser(voteId, user)`                                                             | platformOwner | Sweep unclaimed stake after deadline                    |
| `updatePlatformOwner(newOwner)`                                                        | platformOwner | Transfer platform ownership to a new address            |

### Box storage

| Box name (bytes)                                | Value type  | Size    |
| ----------------------------------------------- | ----------- | ------- |
| `v` (1B) + voteId big-endian (8B) = **9B**      | `VoteState` | 136B    |
| `u` (1B) + voteId (8B) + pubkey (32B) = **41B** | `UserVoteState` | **17B** |

### MBR calculations

```
Vote box MBR  = 2500 + 400 × (9  + 136) = 60,500 µALGO  (paid in createVote)
User box MBR  = 2500 + 400 × (41 + 17)  = 25,700 µALGO  (included in vote payment)
vote payment  = stake + 25,700 µALGO
withdraw refund = stakeLocked + 25,700 µALGO  (box deleted, MBR freed)
```

### VoteState struct (136 bytes)

| Field              | Type                    | Bytes | Description                      |
| ------------------ | ----------------------- | ----- | -------------------------------- |
| `creator`          | Address                 | 32    | Poll creator's wallet            |
| `startAt`          | uint64                  | 8     | Unix timestamp: voting opens     |
| `endAt`            | uint64                  | 8     | Unix timestamp: voting closes    |
| `stake`            | uint64                  | 8     | Required stake per voter (µALGO) |
| `withdrawDeadline` | uint64                  | 8     | endAt + withdrawWindow           |
| `optionCount`      | uint64                  | 8     | Number of options (2–8)          |
| `counts`           | StaticArray\<uint64,8\> | 64    | Vote tallies per option          |

### UserVoteState struct (17 bytes)

| Field         | Type    | Bytes | Description               |
| ------------- | ------- | ----- | ------------------------- |
| `voted`       | boolean | ⎫     | True once user has voted  |
| `withdrawn`   | boolean | ⎬ 1   | True once withdrawn/swept |
| `choice`      | uint64  | 8     | Selected option index     |
| `stakeLocked` | uint64  | 8     | µALGO held for this user  |

> **ARC-4 optimization:** `voted` and `withdrawn` are placed together to enable
> ARC-4 bool packing — both booleans fit in 1 byte, saving 400 µALGO per vote.
> This optimization reduced UserVoteState from 18B → 17B.

---

## Development

### Prerequisites

| Tool           | Install                                                                |
| -------------- | ---------------------------------------------------------------------- |
| Node.js 18+    | `nvm install 18`                                                       |
| AlgoKit CLI    | `pip install algokit` or `brew install algorandfoundation/tap/algokit` |
| Docker Desktop | https://www.docker.com/products/docker-desktop                         |

### Commands

```bash
# Install dependencies (from repo root)
npm install --workspace=contracts

# Compile TEALScript → TEAL + ARC-32/ARC-56 JSON in artifacts/
npm run build --workspace=contracts

# Run unit tests (requires LocalNet running)
algokit localnet start
npm run test --workspace=contracts

# Deploy to TestNet
cp contracts/.env.example contracts/.env  # fill in DEPLOYER_MNEMONIC
npm run deploy --workspace=contracts
```

### Directory structure

```
contracts/
├── src/
│   └── ProofVote.algo.ts    ← TEALScript contract source
├── tests/
│   ├── ProofVote.test.ts    ← Jest unit tests (LocalNet)
│   └── helpers/
│       └── testSetup.ts     ← algod client, deploy, account helpers
├── deploy/
│   └── deploy.ts            ← TestNet deploy script
├── artifacts/               ← Build output (gitignored except JSON)
│   ├── ProofVote.arc32.json
│   └── ProofVote.arc56.json
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Critical TEALScript gotchas

1. **StaticArray in struct** — cannot mutate in-place via box reference:

   ```typescript
   // WRONG: this.votes(id).value.counts[i] += 1;
   // CORRECT:
   const s = this.votes(id).value;
   s.counts[i] = s.counts[i] + 1;
   this.votes(id).value = s;
   ```

2. **Box refs in client** — every touched box must be listed in `boxes: BoxReference[]`
   when building ATC method calls.

3. **Return value extraction** — after `atc.execute()`:

   ```typescript
   const voteId = result.methodResults[0].returnValue; // ABI-decoded uint64
   ```

4. **PayTxn ordering** — in the `vote` method, the PayTxn must come BEFORE the AppCall
   in the atomic group. Pass it as a `TransactionWithSigner` in `methodArgs`.

---

## Deploy result

After `npm run deploy`, the script writes `.deploy-result.json`:

```json
{
  "appId": 123456789,
  "appAddress": "AAAA...",
  "txId": "XXXX...",
  "network": "testnet"
}
```

Copy `appId` to `web/.env.local` as `NEXT_PUBLIC_APP_ID`.
