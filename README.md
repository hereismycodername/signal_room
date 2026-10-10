# Signal Room

[![CI](https://github.com/hereismycodername/signal_room/actions/workflows/ci.yml/badge.svg)](https://github.com/hereismycodername/signal_room/actions/workflows/ci.yml)
[![Solana](https://img.shields.io/badge/Solana-local%20simulation-9945FF)](https://solana.com)
[![Colosseum](https://img.shields.io/badge/Colosseum-Crypto%20World's%20Fair-14F195)](https://colosseum.com/hackathon)

> A forecasting room where communities make private probability estimates and build a verifiable track record of accuracy.

Signal Room helps a group answer a more useful question than “what does the majority think?”: **who has consistently made accurate forecasts?**

## Status

Signal Room is an active hackathon MVP. The forecasting vertical slice, Solana Wallet Standard sign-in, signed forecast receipts, wallet-permissioned Organizer Studio, public room pages, accuracy rankings, and offchain Merkle commitment and result proofs are implemented. An Anchor program and generated Kit client build locally; devnet deployment and app-to-chain writes are still pending.

- [Product and implementation plan](docs/SIGNAL_ROOM_PLAN.md)
- [Commitment proof v1 specification](docs/MERKLE_PROOF_V1.md)
- [Result proof v1 specification](docs/RESULT_PROOF_V1.md)
- Live demo: coming soon
- Demo video: coming soon
- Colosseum project page: coming soon

## Problem and solution

### The problem

Group decisions are usually driven by confidence, popularity, or a simple vote. Public predictions also create herding: later participants copy the visible consensus instead of contributing independent information. When the outcome becomes known, communities rarely keep a reliable record of who was accurate.

### The solution

Signal Room gives every participant a simple probability forecast from 0% to 100%. Forecasts are signed by the participant and stay hidden from other users until the organizer seals the question. After resolution, the application calculates a deterministic Brier score and updates a public accuracy leaderboard.

The current MVP verifies offchain wallet signatures, persists commitment receipts, freezes a Merkle root when each question is sealed, and lets a participant verify their forecast and score proofs in the browser. The next milestone anchors roots on Solana devnet, without forcing users to pay for a transaction for every forecast.

## MVP flow

1. An organizer creates a public room and a binary question.
2. A participant signs in with a Solana wallet.
3. The participant submits a probability forecast before the deadline.
4. Forecasts remain hidden from other participants until the question is sealed.
5. The organizer resolves the question and links the evidence source.
6. Signal Room reveals the distribution, calculates Brier scores, and updates the room leaderboard.
7. A participant can check their commitment and score against the published Merkle roots in their browser.

The browser verifies the proofs independently, but the roots are still supplied by the app server. Solana devnet anchoring is planned; until then, this is not an independently timestamped onchain record.

## Why Solana

- **Public integrity:** room state, deadlines, and finalized result roots can be independently verified.
- **Low-cost anchoring:** many offchain forecasts can be summarized by a single onchain Merkle root.
- **Portable identity:** participants own the wallet that signs each commitment.
- **Clear audit trail:** finalized outcomes cannot be silently rewritten by the application.

Signal Room does not use a token, wagering, user deposits, or a prediction-market AMM in the hackathon MVP.

## Architecture (current app and planned onchain layer)

```text
┌──────────────────────┐
│ Next.js web client   │
│ Rooms · Forecasts    │
│ Profiles · Rankings  │
└──────────┬───────────┘
           │ signed wallet messages + HTTPS
           ▼
┌──────────────────────┐        ┌──────────────────────┐
│ Next.js server       │───────▶│ PostgreSQL           │
│ Auth · API · Scoring │        │ Rooms · Forecasts    │
│ Roots · rankings     │        │ Scores · Nonces      │
└──────────┬───────────┘        └──────────────────────┘
           │ planned: @solana/kit
           ▼
┌──────────────────────┐
│ Solana devnet        │
│ Anchor program       │
│ Room + Question PDAs │
│ Commit/result roots  │
└──────────────────────┘
```

The browser never receives another participant's forecast before sealing. The current server stores signed forecast records, enforces the room lifecycle, computes public summaries and rankings, saves a commitment root at sealing, and saves a score root and evidence hash at resolution. The Anchor program is built locally but not deployed or connected to these API actions yet.

## Planned stack

| Layer | Technology |
| --- | --- |
| Frontend and API | Next.js 16 · React 19 · TypeScript |
| Styling | Tailwind CSS 4 |
| Wallet integration | Wallet Standard · `@solana/kit` 8 plugins |
| Onchain program | Rust · Anchor |
| Data | PostgreSQL |
| Local Solana environment | Surfpool |
| Testing | Vitest · Playwright · Anchor tests |
| Network | Solana devnet |

## Repository layout

```text
.
├── docs/
│   └── SIGNAL_ROOM_PLAN.md   # product, architecture, security, and delivery plan
├── drizzle/                  # PostgreSQL migration
├── public/                   # static assets
├── src/app/                  # Next.js UI and route handlers
│   └── studio/               # organizer room and question lifecycle
├── src/db/                   # Drizzle schema
├── src/server/               # auth, signatures, sessions, persistence
├── src/generated/            # Codama-generated Kit client
├── programs/signal_room/     # Anchor program
├── .github/workflows/        # continuous integration
└── package.json
```

The database schema and migrations, Anchor workspace, and generated client are present.

## Quick start

Requirements: Node.js 20 or newer and npm.

```bash
git clone https://github.com/hereismycodername/signal_room.git
cd signal_room
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `DATABASE_URL` is optional for a quick demo: without it, the app uses an in-memory store that resets when the server restarts. Use PostgreSQL for persistent multi-user testing.

Create a room and question in `/studio`, open the question, then share its `/rooms/<room-id>` page with participants. That public page supports signed forecasts, private receipts, revealed results, a room leaderboard, and a browser-side proof check after sealing.

To enable persistent storage, copy `.env.example` to `.env.local`, set `DATABASE_URL`, then run `npm run db:migrate` before starting the app.

Run the current quality checks:

```bash
npm run lint
npm test
npm run build
```

The Anchor workspace uses Rust, Anchor 1.1.2, and Solana CLI 3.1.10. To rebuild its IDL and generated Kit client, then simulate its complete lifecycle without signing or sending a transaction:

```bash
NO_DNA=1 anchor build
npm run codegen:solana
npm run simulate:anchor
cargo test -p signal_room --lib
```

For a full local API smoke test, start the app with no `DATABASE_URL` and run `SMOKE_BASE_URL=http://127.0.0.1:3000 npm run smoke` in another terminal. It creates a temporary room with two ephemeral test wallets; it will refuse to run against PostgreSQL.

Wallet sign-in and forecast submission only request readable message signatures. They do not create a transaction or spend SOL. No wallet secret or private key should ever be committed to this repository.

## Roadmap

- [x] Product definition and MVP boundary
- [x] Hybrid onchain/offchain architecture
- [x] Initial interaction prototype
- [x] Forecasting-room vertical slice
- [x] Wallet authentication and signed commitments
- [x] PostgreSQL schema, migration, and optional local fallback
- [x] Organizer studio and role enforcement
- [x] Persistent room lifecycle and privacy-preserving aggregate API
- [x] Public pages for newly created rooms and resolved-question rankings
- [x] Offchain Merkle commitment and result snapshots with participant inclusion proofs
- [x] Anchor program, Rust unit tests, local SBF build, generated client, and unsigned LiteSVM lifecycle simulation
- [ ] Signed local validator transaction tests
- [ ] Solana devnet anchoring and explorer links
- [ ] Public user test and demo data
- [ ] Deployment, demo video, and Colosseum submission

## Verification model

For each forecast, the application derives a SHA-256 commitment from the room, question, wallet, probability, and a random salt. The participant signs that commitment. At sealing, the server stores a domain-separated Merkle root and count. At resolution, it stores a second root over outcomes and scores, plus an evidence hash. Participants can verify their own sibling paths in the browser. Anchoring these roots on Solana is the next integrity milestone.

Hidden pre-seal forecasts reduce public herding. The Merkle proof detects an omitted or changed forecast relative to the root the server publishes, but until onchain anchoring is implemented, the server is still trusted for that root and historical integrity. It can see submitted values, so the current design is not operator-blind privacy or zero knowledge.

## Security

The MVP threat model covers replay-resistant wallet sign-in, signature verification, deadline enforcement, duplicate submissions, authorization for resolution, protection of unpublished forecasts, and deterministic Merkle encoding. A focused security review is required before any mainnet or financial functionality.

## Contributing

The project is under active hackathon development. Before opening a pull request, run:

```bash
npm run lint
npm test
npm run build
```

## License

No open-source license has been selected yet. All rights are reserved until a license file is added.
