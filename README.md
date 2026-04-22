# Ride-Agent

Ride-Agent is a ride-booking demo with an AI-assisted chat flow, a mocked marketplace adapter, and an explicit confirmation gate. The assistant can discover ride options, compare prices, prepare a booking proposal, track an active ride, and cancel it, but it cannot directly book a ride. Booking happens only through a separate confirmation step.

## How To Run In Under 3 Minutes

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Project Summary

- Single-repo Next.js 15 + React 19 + TypeScript app
- App Router frontend with a reviewer-facing chat UI and confirmation panel
- Route handlers for chat, confirmation, and session state
- Mock Uber backend behind a swappable marketplace adapter
- Agent/tool layer that discovers rides, compares options, and prepares bookings
- Clickable ride options in both direct-booking and compare flows
- Separate confirmation gate that alone can execute booking
- Structured action log for every important action
- Five reviewer-friendly transcripts, tests, and a short production writeup

## Architecture

The code is intentionally split along the following boundaries:

- `src/server/adapters`
  - Platform adapter contract plus `MockUberAdapter`
  - Owns marketplace-specific concerns like location validation, quote lookup, booking, tracking, and cancellation
- `src/server/tools`
  - Tool layer on top of the adapter
  - Handles validated operations such as finding quotes, preparing a booking for confirmation, tracking, and cancelling
- `src/server/agent`
  - Chat orchestration only
  - Decides when to call tools, when to fall back to deterministic logic, and when to ask the user for confirmation
- `src/server/confirmation-gate`
  - The only code path allowed to execute a booking
  - Requires an explicit approve or reject action for a prepared proposal
- `src/server/logging`
  - Shared action logging used by tools and confirmation decisions
- `src/server/store`
  - In-memory session state for the local demo runtime
- `src/app` and `src/components`
  - Next.js App Router pages, route handlers, and the reviewer-facing React UI

## Why The Uber Backend Is Mocked

A mock backend keeps the demo realistic without spending time on marketplace onboarding, auth, rate limits, sandbox access, or unreliable external dependencies. The important design choice is that the rest of the system does not know it is talking to a mock. Everything goes through the `RideMarketplaceAdapter` interface.

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
- The user must review the prepared booking and explicitly approve it in the confirmation flow
- Rejecting the proposal clears it without creating a ride
- Active rides can be cancelled from the UI without relying only on chat input

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
npm run test:watch
```

## Review Artifacts

- Happy path: [docs/transcripts/happy-path.md](docs/transcripts/happy-path.md)
- Price comparison: [docs/transcripts/price-comparison.md](docs/transcripts/price-comparison.md)
- Bad address: [docs/transcripts/bad-address.md](docs/transcripts/bad-address.md)
- Surge or edge case: [docs/transcripts/surge-edge-case.md](docs/transcripts/surge-edge-case.md)
- Cancellation: [docs/transcripts/cancellation.md](docs/transcripts/cancellation.md)
- Writeup: [docs/writeup.md](docs/writeup.md)

## Notes

- The backend uses a fixed set of recognizable San Francisco locations so the demo stays deterministic and easy to review.
- The UI is built with the Next.js App Router and Tailwind CSS, while the stateful demo runtime remains intentionally lightweight.
- Session state is kept in memory for fast local setup; the audit log is persisted to disk for inspection.
- The optional OpenAI-backed brain layers natural-language responses on top of the deterministic booking flow instead of bypassing the safety boundary.
- The scope stays intentionally tight: no background jobs, no external database, and no unnecessary infrastructure.
- This is a local end-to-end demo designed to show architecture, safety, and workflow rather than a production integration with the real Uber app.
