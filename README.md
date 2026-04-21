# Ride-Agent

Ride-Agent is a take-home demo of an AI assistant that can discover ride options, compare prices, prepare a booking, enforce an explicit user confirmation gate, track an active ride, and cancel it. The default setup is self-contained with a simulated Uber backend, while the server can optionally switch to an OpenAI-backed brain when `OPENAI_API_KEY` is set.

## Stack

- Next.js 15 + React 19 + TypeScript
- Tailwind CSS for the UI
- Zod for validation
- Vitest for tests
- Mock Uber adapter behind a swappable marketplace interface

## Architecture

- `src/server/adapters`: marketplace adapter contract and `MockUberAdapter`
- `src/server/tools`: validated tool functions layered on top of the adapter
- `src/server/agent`: deterministic default agent plus optional OpenAI brain
- `src/server/store`: in-memory session state for the live demo
- `src/server/logging`: append-only JSONL action log persistence under `.runtime/action-logs`
- `src/app`: Next.js UI and API routes
- `docs/transcripts`: required conversation transcripts
- `docs/writeup.md`: one-page writeup on adapter swapping and production risks

## Confirmation Safety

The agent can prepare a booking proposal, but it cannot book directly from chat. Booking only executes through `POST /api/confirm`, which requires a valid proposal id and explicit approval. Rejected proposals never create a ride.

## Action Logging

Every tool attempt records:

- `requested`
- `verified`
- `executed`
- `happened`

Action logs are visible in the UI and persisted to `.runtime/action-logs/<session>.jsonl`.

## Quickstart

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Optional OpenAI mode:

```bash
cp .env.example .env.local
```

Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL`. If no key is present, the app uses the deterministic local agent.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run test
```

## Demo Scenarios

- Happy path: [docs/transcripts/happy-path.md](docs/transcripts/happy-path.md)
- Price comparison: [docs/transcripts/price-comparison.md](docs/transcripts/price-comparison.md)
- Bad address: [docs/transcripts/bad-address.md](docs/transcripts/bad-address.md)
- Surge or edge case: [docs/transcripts/surge-edge-case.md](docs/transcripts/surge-edge-case.md)
- Cancellation: [docs/transcripts/cancellation.md](docs/transcripts/cancellation.md)

## Notes

- The mock backend uses a fixed set of recognizable San Francisco locations so the demo remains deterministic.
- Session state is in-memory for fast local runs; action logs persist on disk for auditability.
- The adapter seam is intentionally realistic enough to swap in Lyft or a real marketplace integration later.
