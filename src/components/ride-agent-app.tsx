"use client";

import clsx from "clsx";
import { startTransition, useMemo, useState } from "react";
import {
  ActionLogEntry,
  ChatResponse,
  ConversationMessage,
  RideOption,
  SessionState
} from "@/server/domain/types";

const starterPrompts = [
  "Book a ride from Mission Dolores Park to Salesforce Tower",
  "Compare prices from 1 Market St to SFO Airport",
  "Book a ride from Atlantis Ave to Pier 39"
];

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function Bubble({ message }: { message: ConversationMessage }) {
  const isUser = message.actor === "user";

  return (
    <div
      className={clsx(
        "max-w-[85%] rounded-[28px] px-4 py-3 text-sm shadow-sm",
        isUser
          ? "ml-auto bg-ink text-white"
          : "bg-white text-slate-700 ring-1 ring-slate-200"
      )}
    >
      <div className="mb-1 text-[10px] uppercase tracking-[0.3em] opacity-60">
        {message.actor}
      </div>
      <p>{message.text}</p>
    </div>
  );
}

function QuoteCard({ option }: { option: RideOption }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-lg text-ink">{option.productName}</h3>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            {option.marketplace}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold text-ink">
            {formatMoney(option.priceCents)}
          </p>
          <p className="text-xs text-slate-500">{option.etaMinutes} min ETA</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-600">{option.rideSummary}</p>
      {option.surgeMultiplier > 1 ? (
        <p className="mt-3 inline-flex rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-700">
          Surge x{option.surgeMultiplier.toFixed(1)}
        </p>
      ) : null}
    </div>
  );
}

function ActionLog({ entries }: { entries: ActionLogEntry[] }) {
  return (
    <div className="space-y-3">
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">No tool activity yet.</p>
      ) : null}
      {entries
        .slice()
        .reverse()
        .map((entry) => (
          <div
            key={entry.id}
            className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-medium text-ink">{entry.toolName}</h3>
              <span className="text-xs text-slate-500">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <dl className="mt-3 grid gap-2 text-xs text-slate-600">
              <div>
                <dt className="font-semibold text-slate-800">requested</dt>
                <dd className="mt-1 whitespace-pre-wrap">
                  {JSON.stringify(entry.requested, null, 2)}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-800">verified</dt>
                <dd className="mt-1 whitespace-pre-wrap">
                  {JSON.stringify(entry.verified, null, 2)}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-800">executed</dt>
                <dd className="mt-1 whitespace-pre-wrap">
                  {JSON.stringify(entry.executed, null, 2)}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-800">happened</dt>
                <dd className="mt-1 whitespace-pre-wrap">
                  {JSON.stringify(entry.happened, null, 2)}
                </dd>
              </div>
            </dl>
          </div>
        ))}
    </div>
  );
}

export function RideAgentApp() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [message, setMessage] = useState("");
  const [lastResponse, setLastResponse] = useState<ChatResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const options = session?.rideOptions ?? [];

  const activeRide = session?.activeRide;
  const pendingProposal = session?.pendingProposal;

  const sortedMessages = useMemo(
    () => session?.messages ?? [],
    [session?.messages]
  );

  async function sendMessage(text: string) {
    setIsLoading(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: session?.sessionId,
          message: text
        })
      });

      const payload: ChatResponse = await response.json();
      startTransition(() => {
        setSession(payload.session);
        setLastResponse(payload);
        setMessage("");
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function confirmProposal(approved: boolean) {
    if (!session?.sessionId || !pendingProposal) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: session.sessionId,
          proposalId: pendingProposal.proposalId,
          approved
        })
      });
      const payload: ChatResponse = await response.json();
      startTransition(() => {
        setSession(payload.session);
        setLastResponse(payload);
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.16),_transparent_32%),linear-gradient(180deg,_#fffaf5_0%,_#f6efe4_55%,_#efe6d8_100%)] px-4 py-8 text-slate-900 sm:px-6 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <section className="overflow-hidden rounded-[36px] border border-white/70 bg-white/70 shadow-panel backdrop-blur">
          <div className="border-b border-slate-200/80 px-6 py-6">
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
              Ride-Agent
            </p>
            <h1 className="mt-3 font-display text-4xl leading-tight text-ink">
              AI ride booking with a hard confirmation gate.
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-600">
              The agent can discover rides, compare prices, prepare a booking,
              track progress, and cancel. Booking only executes through the
              explicit confirm action and every tool call is logged.
            </p>
          </div>

          <div className="grid gap-6 px-6 py-6 xl:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {starterPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendMessage(prompt)}
                    className="rounded-full border border-slate-300 bg-white px-3 py-2 text-left text-xs text-slate-600 transition hover:border-ember hover:text-ember"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <div className="flex min-h-[420px] flex-col gap-3 rounded-[28px] bg-sand/60 p-4 ring-1 ring-slate-200">
                {sortedMessages.length === 0 ? (
                  <div className="m-auto max-w-sm text-center text-sm text-slate-500">
                    Start with a ride request like{" "}
                    <span className="font-medium text-slate-700">
                      from Mission Dolores Park to Salesforce Tower
                    </span>
                    .
                  </div>
                ) : null}
                {sortedMessages.map((entry) => (
                  <Bubble key={entry.id} message={entry} />
                ))}
              </div>

              <form
                className="flex gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!message.trim()) {
                    return;
                  }
                  void sendMessage(message);
                }}
              >
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={3}
                  placeholder="Ask for a ride, compare prices, track a trip, or cancel."
                  className="min-h-24 flex-1 rounded-[24px] border border-slate-300 bg-white px-4 py-3 text-sm outline-none ring-0 transition focus:border-ember"
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="rounded-[24px] bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? "Working..." : "Send"}
                </button>
              </form>
            </div>

            <aside className="space-y-4">
              <div className="rounded-[28px] bg-ink p-5 text-white shadow-sm">
                <p className="text-xs uppercase tracking-[0.35em] text-white/60">
                  Confirmation Gate
                </p>
                {pendingProposal ? (
                  <div className="mt-4 space-y-3">
                    <p className="font-display text-2xl">
                      {pendingProposal.option.productName}
                    </p>
                    <p className="text-sm text-white/80">
                      {pendingProposal.summary}
                    </p>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => void confirmProposal(true)}
                        className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900"
                      >
                        Confirm Ride
                      </button>
                      <button
                        type="button"
                        onClick={() => void confirmProposal(false)}
                        className="rounded-full border border-white/20 px-4 py-2 text-sm"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-white/75">
                    No pending booking. The agent can prepare one, but it cannot
                    book until you approve it here.
                  </p>
                )}
              </div>

              {options.length > 0 ? (
                <div className="space-y-3">
                  <h2 className="font-display text-2xl text-ink">Ride Options</h2>
                  {options.map((option) => (
                    <QuoteCard key={option.optionId} option={option} />
                  ))}
                </div>
              ) : null}

              {activeRide ? (
                <div className="rounded-[28px] border border-moss/20 bg-moss/10 p-5">
                  <p className="text-xs uppercase tracking-[0.35em] text-moss">
                    Active Ride
                  </p>
                  <h2 className="mt-3 font-display text-2xl text-ink">
                    {activeRide.phase.replaceAll("_", " ")}
                  </h2>
                  <p className="mt-2 text-sm text-slate-700">
                    {activeRide.driver.name} in a {activeRide.driver.vehicle}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Plate {activeRide.driver.licensePlate}
                  </p>
                </div>
              ) : null}
            </aside>
          </div>
        </section>

        <section className="rounded-[36px] border border-white/70 bg-white/70 p-6 shadow-panel backdrop-blur">
          <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
            Action Log
          </p>
          <h2 className="mt-3 font-display text-3xl text-ink">
            Every tool attempt is auditable.
          </h2>
          <p className="mt-3 text-sm text-slate-600">
            Each entry records what the user requested, what the system
            verified, what executed, and what happened.
          </p>
          <div className="mt-6 max-h-[70vh] overflow-auto pr-1">
            <ActionLog entries={session?.actionLog ?? []} />
          </div>
        </section>
      </div>
    </main>
  );
}
