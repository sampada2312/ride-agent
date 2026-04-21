# Ride-Agent

Ride-Agent is a take-home demo of an AI assistant that can discover ride options, compare prices, prepare a ride booking, track an active ride, and cancel it. The key safety rule is simple: the chat agent can never directly book a ride. It can only prepare a booking proposal for review, and booking is executed exclusively through a separate confirmation gate.

## How To Run In Under 3 Minutes

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Optional:

```bash
cp .env.example .env.local
```

Set `OPENAI_API_KEY` if you want to enable the optional OpenAI-backed brain. Without a key, the app runs fully locally with the deterministic demo agent.

## Project Summary

- Single-repo Next.js + TypeScript demo
- Mock Uber backend behind a swappable marketplace adapter
- Agent/tool layer that discovers rides and prepares bookings
- Separate confirmation gate that alone can execute booking
- Structured action log for every important action
- Five reviewer-friendly transcripts and a short production writeup

## Architecture

The code is intentionally split along the boundaries the assignment asks for:

- `src/server/adapters`
  - Platform adapter contract plus `MockUberAdapter`
  - Owns marketplace-specific concerns like location validation, quote lookup, booking, tracking, and cancellation
- `src/server/tools`
  - Tool layer on top of the adapter
  - Handles validated operations such as finding quotes, preparing a booking for confirmation, tracking, and cancelling
- `src/server/agent`
  - Chat orchestration only
  - Decides when to call tools and when to ask the user for confirmation
- `src/server/confirmation-gate`
  - The only code path allowed to execute a booking
  - Requires an explicit approve or reject action for a prepared proposal
- `src/server/logging`
  - Shared action logging used by tools and confirmation decisions
- `src/server/store`
  - Session state for the local demo UI
- `src/app` and `src/components`
  - Reviewer-facing UI and API routes

## Why The Uber Backend Is Mocked

For a take-home, a mock backend keeps the demo realistic without spending time on marketplace onboarding, auth, rate limits, sandbox access, or unreliable external dependencies. The important design choice is that the rest of the system does not know it is talking to a mock. Everything goes through the `RideMarketplaceAdapter` interface.

That means a Lyft adapter or another marketplace adapter would plug into the same contract:

- `validateLocation`
- `getRideOptions`
- `bookRide`
- `getRideStatus`
- `cancelRide`

The agent, confirmation gate, UI, and logging all operate on normalized domain types rather than provider-specific payloads.

## Confirmation Gate

The confirmation story is deliberately explicit in both code and UI:

- Chat can gather context, compare options, and prepare a booking proposal
- Chat cannot directly call booking execution
- Booking execution lives in `src/server/confirmation-gate`
- The user must review the prepared booking and click `Confirm Ride`
- Rejecting the proposal clears it without creating a ride

This makes the safety boundary easy to inspect during review and easy to extend later with stronger auth, approvals, or idempotency.

## Action Logs

Every important action writes a structured log entry with:

- `timestamp`
- `userRequest`
- `verified`
- `executed`
- `outcome`
- `success`

Logs are shown in the UI and persisted to `.runtime/action-logs/<session>.jsonl`. The goal is to make it obvious what the system was asked to do, what checks it performed, what it actually executed, and how it ended.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run test
```

## Review Artifacts

- Happy path: [docs/transcripts/happy-path.md](docs/transcripts/happy-path.md)
- Price comparison: [docs/transcripts/price-comparison.md](docs/transcripts/price-comparison.md)
- Bad address: [docs/transcripts/bad-address.md](docs/transcripts/bad-address.md)
- Surge or edge case: [docs/transcripts/surge-edge-case.md](docs/transcripts/surge-edge-case.md)
- Cancellation: [docs/transcripts/cancellation.md](docs/transcripts/cancellation.md)
- Writeup: [docs/writeup.md](docs/writeup.md)

## Notes

- The mock backend uses a fixed set of recognizable San Francisco locations so the demo stays deterministic and easy to review.
- Session state is in-memory for fast local setup; the audit log is persisted to disk for inspection.
- The scope stays intentionally tight: no fancy NLP, no background jobs, and no unnecessary infrastructure.
