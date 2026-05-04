# Manual UI Tests — ProofVote

Scenarios to verify in the browser after starting the dev server and localnet.  
Contract and API tests are covered by unit tests — this file covers only what requires clicking.

---

## Table of Contents

- [Wallet Connection](#wallet-connection)
- [Creating a Poll](#creating-a-poll)
- [Voting](#voting)
- [Withdrawing Funds](#withdrawing-funds)
- [Sweep (Platform Owner)](#sweep-platform-owner)

---

## Wallet Connection

| # | Steps | Expected Result |
|---|-------|-----------------|
| CW-1 | Click "Connect Wallet" | List of available wallets (e.g. Pera, Defly) |
| CW-2 | Select a wallet and authorize | Shortened address in the header + "Disconnect" button |
| CW-3 | Click "Disconnect" | Returns to the "Connect Wallet" button |

---

## Creating a Poll

**Precondition:** wallet connected, account with ALGO on the local network.

| # | Steps | Expected Result |
|---|-------|-----------------|
| CF-1 | Click "Create Vote" without filling out the form | Validation errors (title required, end date required, min. 2 options) |
| CF-2 | Fill in title, ≥2 options, a future end date → "Create Vote" | Wallet prompts for signature and transaction; after approval, redirected to the poll page |
| CF-3 | Reject the transaction in the wallet | Error message in the UI; form still active |

---

## Voting

**Precondition:** poll is active (endAt in the future), wallet connected with an account other than the creator.

| # | Steps | Expected Result |
|---|-------|-----------------|
| VF-1 | Open the poll page | Voting options visible; "Submit Vote" button disabled |
| VF-2 | Click an option → "Submit Vote" | Wallet prompts for transaction; after approval, "Vote submitted!" message |
| VF-3 | Refresh the page with the same wallet | Form disabled with "You have already voted" message |
| VF-4 | Reject the transaction in the wallet | Error message; form still active |

---

## Withdrawing Funds

**Precondition:** you voted on a poll that has already ended (endAt in the past, before withdrawDeadline).

| # | Steps | Expected Result |
|---|-------|-----------------|
| WD-1 | Open "My Refunds" | Poll visible with ALGO amount available to withdraw |
| WD-2 | Click "Withdraw all" | Wallet prompts for transaction; after approval, "Done — withdrawn 1 of 1" |
| WD-3 | Refresh the page after withdrawal | Refunds list is empty |

---

## Sweep (Platform Owner)

**Precondition:** logged in as platformOwner; there is a vote with withdrawDeadline in the past whose voter has not withdrawn their stake.

| # | Steps | Expected Result |
|---|-------|-----------------|
| SW-1 | Open the sweep panel | List of users with an expired stake |
| SW-2 | Click "Sweep all" | Wallet prompts for transaction; after approval, "Done — swept X of X" |
| SW-3 | Refresh the panel after sweep | List is empty |
