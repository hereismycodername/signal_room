# Signal Room

[![CI](https://github.com/hereismycodername/signal_room/actions/workflows/ci.yml/badge.svg)](https://github.com/hereismycodername/signal_room/actions/workflows/ci.yml)
[![Solana](https://img.shields.io/badge/Solana-devnet-9945FF)](https://solana.com)
[![Colosseum](https://img.shields.io/badge/Colosseum-Crypto%20World's%20Fair-14F195)](https://colosseum.com/hackathon)

> A forecasting room where communities make private probability estimates and build a verifiable track record of accuracy.

Signal Room helps a group answer a more useful question than “what does the majority think?”: **who has consistently made accurate forecasts?**

## Status

Signal Room is an active hackathon MVP. The product specification and system design are complete; the repository currently contains an early interaction prototype that is being replaced by the forecasting flow.

- [Product and implementation plan](docs/SIGNAL_ROOM_PLAN.md)
- Live demo: coming soon
- Demo video: coming soon
- Colosseum project page: coming soon

## Problem and solution

### The problem

Group decisions are usually driven by confidence, popularity, or a simple vote. Public predictions also create herding: later participants copy the visible consensus instead of contributing independent information. When the outcome becomes known, communities rarely keep a reliable record of who was accurate.

### The solution

Signal Room gives every participant a simple probability forecast from 0% to 100%. Forecasts stay hidden until the deadline, are signed by the participant, and are committed before the result is known. After resolution, the application calculates a deterministic Brier score and updates a public accuracy leaderboard.

The MVP anchors commitment and result roots on Solana devnet. This makes the history independently verifiable without forcing users to pay for a transaction for every forecast.

## MVP flow

1. An organizer creates a public room and a binary question.
2. A participant signs in with a Solana wallet.
3. The participant submits a probability forecast before the deadline.
4. Forecasts remain hidden from other participants until the question is sealed.
5. The organizer resolves the question and links the evidence source.
6. Signal Room reveals the distribution, calculates Brier scores, and updates the leaderboard.
7. Anyone can inspect the corresponding Solana devnet transaction and verify inclusion in the published root.

## Why Solana

- **Public integrity:** room state, deadlines, and finalized result roots can be independently verified.
- **Low-cost anchoring:** many offchain forecasts can be summarized by a single onchain Merkle root.
- **Portable identity:** participants own the wallet that signs each commitment.
- **Clear audit trail:** finalized outcomes cannot be silently rewritten by the application.

Signal Room does not use a token, wagering, user deposits, or a prediction-market AMM in the hackathon MVP.

## Architecture

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
│ Merkle aggregation   │        │ Scores · Nonces      │
└──────────┬───────────┘        └──────────────────────┘
           │ @solana/kit
           ▼
┌──────────────────────┐
│ Solana devnet        │
│ Anchor program       │
│ Room + Question PDAs │
│ Commit/result roots  │
└──────────────────────┘
```

The browser never receives another participant's forecast before sealing. The server stores signed forecast records and later produces a deterministic Merkle tree. The Anchor program owns the canonical lifecycle and finalized roots.

## Planned stack

| Layer | Technology |
| --- | --- |
| Frontend and API | Next.js 16 · React 19 · TypeScript |
| Styling | Tailwind CSS 4 |
| Wallet integration | Wallet Standard · `@solana/kit` |
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
├── public/                   # static assets
├── src/app/                  # Next.js application
├── .github/workflows/        # continuous integration
└── package.json
```

The Anchor workspace, database schema, and generated client will be added as their implementation milestones begin.

## Quick start

Requirements: Node.js 20 or newer and npm.

```bash
git clone https://github.com/hereismycodername/signal_room.git
cd signal_room
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Run the current quality checks:

```bash
npm run lint
npm run build
```

Solana and database setup instructions will be added with those components. No wallet secret or private key should ever be committed to this repository.

## Roadmap

- [x] Product definition and MVP boundary
- [x] Hybrid onchain/offchain architecture
- [x] Initial interaction prototype
- [ ] Forecasting-room vertical slice
- [ ] Wallet authentication and signed commitments
- [ ] PostgreSQL persistence and deterministic scoring
- [ ] Anchor program and local validator tests
- [ ] Solana devnet anchoring and explorer links
- [ ] Public user test and demo data
- [ ] Deployment, demo video, and Colosseum submission

## Verification model

For each forecast, the application derives a commitment from the room, question, wallet, probability, and a random salt. The participant signs that commitment. After sealing, the server publishes the forecasts and Merkle proofs; a root is anchored on Solana.

This design protects against public herding and silent historical edits. The MVP server can still see submitted values, so it should not be described as operator-blind privacy or zero knowledge.

## Security

The MVP threat model covers replay-resistant wallet sign-in, signature verification, deadline enforcement, duplicate submissions, deterministic Merkle encoding, authorization for resolution, and protection of unpublished forecasts. A focused security review is required before any mainnet or financial functionality.

## Contributing

The project is under active hackathon development. Before opening a pull request, run:

```bash
npm run lint
npm run build
```

## License

No open-source license has been selected yet. All rights are reserved until a license file is added.
