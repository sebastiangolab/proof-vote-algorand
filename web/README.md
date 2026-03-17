# ProofVote — Web App

Next.js 14 frontend for the ProofVote dApp. Handles wallet connection, poll creation/voting UI, and off-chain metadata storage in MySQL via Prisma.

## Requirements

- Node.js 18+
- npm 9+
- MySQL database (CyberFolks or local)
- Deployed ProofVote contract (see `contracts/`)

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

| Variable                               | Description                         |
| -------------------------------------- | ----------------------------------- |
| `DATABASE_URL`                         | MySQL connection string             |
| `NEXT_PUBLIC_ALGORAND_NETWORK`         | `testnet` or `mainnet`              |
| `NEXT_PUBLIC_APP_ID`                   | Deployed contract App ID            |
| `NEXT_PUBLIC_ALGOD_SERVER`             | Algod server URL                    |
| `NEXT_PUBLIC_ALGOD_PORT`               | Algod port (443 for AlgoNode)       |
| `NEXT_PUBLIC_ALGOD_TOKEN`              | Algod token (empty for AlgoNode)    |
| `NEXT_PUBLIC_PLATFORM_OWNER_ADDRESS`   | Platform owner wallet address       |

## Commands

```bash
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build (TypeScript check included)
npm run start        # Start production server
npm run test         # Run Jest test suite
npm run test:watch   # Run tests in watch mode
```

## Database Setup

```bash
npx prisma db push       # Sync schema to database (no shadow DB required)
npx prisma studio        # Open visual DB browser
npx prisma generate      # Re-generate Prisma client
```

## Directory Structure

```
app/
  layout.tsx          ← Root layout with WalletProvider
  page.tsx            ← Home page (hero + how-it-works)
  votes/
    page.tsx          ← Vote list (SSR from Prisma)
    [slug]/page.tsx   ← Vote detail (SSR meta + client on-chain data)
  create/page.tsx     ← Create vote (client component)
  api/votes/
    route.ts          ← GET (pagination) + POST (create metadata)
    [slug]/route.ts   ← GET by slug
components/
  WalletProvider.tsx  ← use-wallet-react WalletManager setup
  ConnectWallet.tsx   ← Wallet connect/disconnect button
  VoteCard.tsx        ← Poll list card
  VoteDetail.tsx      ← On-chain state display with stake info
  VoteForm.tsx        ← Voting form (option select + submit)
  CreateVoteForm.tsx  ← Multi-step create poll form
  SweepUser.tsx       ← Platform owner sweep UI
  ui/                 ← shadcn/ui components
lib/
  algorand.ts         ← Algod client, box name builders, struct decoders
  contract-client.ts  ← ATC builders for all contract methods
  prisma.ts           ← Prisma client singleton
  rateLimit.ts        ← Sliding window rate limiter (5 req/min per IP)
  signatures.ts       ← algosdk.verifyBytes wrapper
  schemas.ts          ← Zod validation schemas for API routes
prisma/
  schema.prisma       ← VoteMetadata model + Chain enum
```

## Page Rendering

| Route           | Strategy                   | Data           |
| --------------- | -------------------------- | -------------- |
| `/`             | Static                     | —              |
| `/votes`        | SSR                        | Prisma         |
| `/votes/[slug]` | SSR meta + client on-chain | Prisma + algod |
| `/create`       | Client                     | —              |

## Dodawanie funkcji wywołujących metody smart kontraktu

Wszystkie wywołania kontraktu budowane są w `lib/contract-client.ts` przy użyciu `AtomicTransactionComposer` (ATC) z algosdk. Każda metoda kontraktowa dostaje osobną funkcję `build*Atc` zwracającą gotowy ATC.

### Schemat

```ts
export async function buildNazwaMetodyAtc(params: {
  sender: string;                     // adres wywołującego
  // ... parametry metody
  signer: algosdk.TransactionSigner;  // signer z useWallet()
}): Promise<algosdk.AtomicTransactionComposer> {
  const algod = getAlgodClient();
  const appId = getAppId();
  const sp = await algod.getTransactionParams().do(); // aktualne parametry sieci

  const atc = new algosdk.AtomicTransactionComposer();

  atc.addMethodCall({
    appID: appId,
    method: contract.getMethodByName("nazwaMetody"), // musi zgadzać się z ABI
    methodArgs: [ /* argumenty metody w kolejności z ABI */ ],
    sender: params.sender,
    suggestedParams: { ...sp, fee: 1000n, flatFee: true },
    signer: params.signer,
    boxes: [
      // każdy box odczytywany lub zapisywany przez kontrakt musi być tu zadeklarowany
      { appIndex: appId, name: generateVoteBoxName(params.voteId) },
    ],
  });

  return atc;
}
```

Wywołanie z komponentu:
```ts
const atc = await buildNazwaMetodyAtc({ sender: activeAddress, ..., signer: transactionSigner });
const algod = getAlgodClient();
await atc.execute(algod, 4); // 4 = liczba rund oczekiwania na potwierdzenie
```

### Jeśli metoda wymaga PayTxn

Kontrakt ABI odczytuje PayTxn z poprzedniej transakcji w grupie — PayTxn musi być **przed** AppCall:

```ts
const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
  sender: params.sender,
  receiver: algosdk.getApplicationAddress(appId),
  amount: KWOTA,
  suggestedParams: { ...sp, fee: 1000n, flatFee: true },
});

atc.addMethodCall({
  // ...
  methodArgs: [
    param1,
    { txn: payTxn, signer: params.signer }, // PayTxn jako argument ABI
  ],
});
```

### Deklarowanie boxów

AVM wymaga jawnej deklaracji każdego boxa, do którego kontrakt sięga. Bez deklaracji transakcja się nie wykona:

```ts
boxes: [
  { appIndex: appId, name: generateVoteBoxName(voteId) },       // box głosowania (odczyt)
  { appIndex: appId, name: generateUserVoteBoxName(voteId, address) }, // box użytkownika (zapis/usunięcie)
],
```

### MBR — opłata za tworzenie boxa

Każdy nowy box wymaga wpłacenia minimalnego salda (MBR) na konto kontraktu. Wartość zależy od rozmiaru boxa:

```
MBR = 2500 + 400 * (długość_nazwy + długość_wartości)  [µALGO]
```

Kwoty dla tego kontraktu zdefiniowane są jako stałe na górze `contract-client.ts`.

## Key Design Decisions

- **Box storage**: vote state in `votes_{voteId}` boxes, user state in `user_{voteId}_{address}` boxes — no local state
- **MBR pattern**: callers pay for box creation explicitly via PayTxn
- **Webpack fallback**: `webpackFallback` from use-wallet-react applied in next.config.ts to avoid bundling optional native deps
- **BigInt serialization**: custom replacer required when serializing DB data containing BigInt fields
