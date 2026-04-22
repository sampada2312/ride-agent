"use client";

import clsx from "clsx";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionLogEntry,
  ChatResponse,
  ChatSuggestion,
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

function formatTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC"
  }).format(new Date(timestamp));
}

function renderFieldValue(value: unknown) {
  if (value === null || value === undefined) {
    return "none";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? "[]" : value.join(", ");
  }

  return JSON.stringify(value);
}

function Bubble({ message }: { message: ConversationMessage }) {
  const isUser = message.actor === "user";

  return (
    <div
      className={clsx(
        "max-w-[88%] rounded-[28px] px-4 py-3 text-sm shadow-sm",
        isUser
          ? "ml-auto bg-ink text-white"
          : "bg-white text-slate-700 ring-1 ring-slate-200"
      )}
    >
      <div className="mb-1 text-[10px] uppercase tracking-[0.3em] opacity-60">
        {message.actor}
      </div>
      <p className="whitespace-pre-wrap break-words leading-6">{message.text}</p>
    </div>
  );
}

function QuoteCard({
  option,
  onSelect,
  isSelected,
  isLoading
}: {
  option: RideOption;
  onSelect: (option: RideOption) => Promise<void>;
  isSelected: boolean;
  isLoading: boolean;
}) {
  return (
    <button
      type="button"
      disabled={isLoading}
      onClick={() => void onSelect(option)}
      className={clsx(
        "w-full rounded-[22px] border bg-white p-4 text-left shadow-sm transition",
        isSelected
          ? "border-amber-400 ring-2 ring-amber-200"
          : "border-slate-200 hover:border-ember hover:shadow-md",
        isLoading && "cursor-not-allowed opacity-70"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg text-ink">
            {option.productName}
          </h3>
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
            {option.marketplace}
          </p>
        </div>
        <div className="text-right">
          <p className="text-base font-semibold text-ink">
            {formatMoney(option.priceCents)}
          </p>
          <p className="text-[11px] text-slate-500">{option.etaMinutes} min ETA</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="rounded-full bg-slate-100 px-2.5 py-1">
          {option.rideSummary}
        </span>
        {option.surgeMultiplier > 1 ? (
          <span className="rounded-full bg-orange-100 px-2.5 py-1 font-medium text-orange-700">
            Surge x{option.surgeMultiplier.toFixed(1)}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">
        {isSelected
          ? "Prepared in confirmation gate"
          : "Click to prepare this option"}
      </p>
    </button>
  );
}

function AuditFieldGroup({
  label,
  data
}: {
  label: string;
  data: Record<string, unknown>;
}) {
  const entries = Object.entries(data);

  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">
        {label}
      </p>
      {entries.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">No fields recorded.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {entries.map(([key, value]) => (
            <div
              key={key}
              className="grid gap-1 border-b border-slate-200/80 pb-2 last:border-b-0 last:pb-0"
            >
              <p className="text-[11px] font-medium text-slate-700">{key}</p>
              <p className="break-words text-xs leading-5 text-slate-600">
                {renderFieldValue(value)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionLog({
  entries,
  isExpanded,
  onToggle
}: {
  entries: ActionLogEntry[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const latestEntry = entries.at(-1);

  return (
    <div>
      <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
              Audit Summary
            </p>
            <p className="mt-1 text-sm text-slate-700">
              {entries.length === 0
                ? "No actions yet."
                : `${entries.length} actions recorded. Latest: ${latestEntry?.action}.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition hover:border-ember hover:text-ember"
          >
            {isExpanded ? "Hide audit log" : "View audit log"}
          </button>
        </div>
      </div>

      {isExpanded ? (
        <div className="mt-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="space-y-3">
            {entries.length === 0 ? (
              <p className="text-sm text-slate-500">No actions yet.</p>
            ) : null}
            {entries
              .slice()
              .reverse()
              .map((entry) => (
                <article
                  key={entry.id}
                  className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
                        Action
                      </p>
                      <h3 className="mt-1 break-words font-medium text-ink">
                        {entry.action}
                      </h3>
                    </div>
                    <div
                      className={clsx(
                        "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                        entry.success
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-rose-100 text-rose-700"
                      )}
                    >
                      {entry.success ? "success" : "failure"}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                        Timestamp
                      </p>
                      <p className="mt-2 text-sm text-slate-700">
                        {formatTimestamp(entry.timestamp)} UTC
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                        Request
                      </p>
                      <p className="mt-2 break-words text-sm leading-6 text-slate-700">
                        {entry.userRequest}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3">
                    <AuditFieldGroup label="Verified" data={entry.verified} />
                    <AuditFieldGroup label="Executed" data={entry.executed} />
                    <AuditFieldGroup label="Outcome" data={entry.outcome} />
                  </div>
                </article>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ConfirmationGatePanel({
  activeRide,
  pendingProposal,
  isLoading,
  onDecision,
  onCancel
}: {
  activeRide?: SessionState["activeRide"];
  pendingProposal: SessionState["pendingProposal"];
  isLoading: boolean;
  onDecision: (approved: boolean) => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  return (
    <div className="rounded-[28px] bg-ink p-5 text-white shadow-sm">
      <p className="text-xs uppercase tracking-[0.35em] text-white/60">
        Confirmation Gate
      </p>
      <h2 className="mt-3 font-display text-2xl leading-tight">
        Confirmation required
      </h2>
      {activeRide ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-[22px] bg-white/10 p-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-white/60">
              Active Ride
            </p>
            <p className="mt-2 font-display text-2xl capitalize">
              {activeRide.phase.replaceAll("_", " ")}
            </p>
            <p className="mt-2 text-sm text-white/80">
              {activeRide.option.productName} with {activeRide.driver.name}
            </p>
            <p className="mt-1 text-sm text-white/70">
              {activeRide.driver.vehicle} • {activeRide.driver.licensePlate}
            </p>
          </div>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => void onCancel()}
            className="w-full rounded-full bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:opacity-60"
          >
            Cancel Ride
          </button>
        </div>
      ) : pendingProposal ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-[22px] bg-white/10 p-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-white/60">
              Prepared Booking
            </p>
            <p className="mt-2 font-display text-2xl">
              {pendingProposal.option.productName}
            </p>
            <p className="mt-2 inline-flex rounded-full bg-amber-400/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
              Prepared option selected
            </p>
            <p className="mt-2 break-words text-sm text-white/80">
              {pendingProposal.summary}
            </p>
            <p className="mt-2 text-xs text-white/60">
              Review and confirm to book.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => void onDecision(true)}
              className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
            >
              Confirm Ride
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => void onDecision(false)}
              className="rounded-full border border-white/20 px-4 py-2 text-sm disabled:opacity-60"
            >
              Reject
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-[22px] bg-white/10 p-4 text-sm text-white/80">
          No ride is ready yet. Choose an option to prepare it here.
        </div>
      )}
    </div>
  );
}

function SuggestionChips({
  suggestions,
  onPick,
  isLoading
}: {
  suggestions: ChatSuggestion[];
  onPick: (prompt: string) => Promise<void>;
  isLoading: boolean;
}) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((suggestion) => (
        <button
          key={`${suggestion.label}-${suggestion.prompt}`}
          type="button"
          disabled={isLoading}
          onClick={() => void onPick(suggestion.prompt)}
          className="rounded-full border border-slate-300 bg-white px-3 py-2 text-left text-xs text-slate-700 transition hover:border-ember hover:text-ember disabled:opacity-60"
        >
          {suggestion.label}
        </button>
      ))}
    </div>
  );
}

export function RideAgentApp() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastResponse, setLastResponse] = useState<ChatResponse | null>(null);
  const [isAuditLogExpanded, setIsAuditLogExpanded] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const options = session?.rideOptions ?? [];
  const activeRide = session?.activeRide;
  const pendingProposal = session?.pendingProposal;
  const messages = useMemo(() => session?.messages ?? [], [session?.messages]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({
      block: "end"
    });
  }, [messages, lastResponse?.suggestions]);

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

  async function selectRideOption(option: RideOption) {
    if (pendingProposal?.option.optionId === option.optionId) {
      return;
    }
    await sendMessage(`Book ${option.productName}`);
  }

  async function cancelActiveRide() {
    await sendMessage("Cancel the ride");
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.16),_transparent_32%),linear-gradient(180deg,_#fffaf5_0%,_#f6efe4_55%,_#efe6d8_100%)] px-4 py-4 text-slate-900 sm:px-6 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-6 lg:h-[calc(100vh-2rem)] lg:grid-cols-[1.25fr_0.75fr]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-[36px] border border-white/70 bg-white/70 shadow-panel backdrop-blur">
          <div className="border-b border-slate-200/80 px-5 py-5 sm:px-6">
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
              Ride-Agent
            </p>
            <h1 className="mt-3 font-display text-3xl leading-tight text-ink sm:text-4xl">
              AI ride booking, with booking locked behind review and approval.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Discover, compare, prepare, track, and cancel rides. Booking only
              happens after explicit confirmation.
            </p>
          </div>

          <div className="grid min-h-0 flex-1 gap-6 px-5 py-5 xl:grid-cols-[minmax(0,1fr)_320px] sm:px-6">
            <div className="flex min-h-0 min-w-0 flex-col gap-4">
              <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                <span className="font-semibold">Safety rule:</span> chat can
                prepare, but only confirmation can book.
              </div>

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

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] bg-sand/60 ring-1 ring-slate-200 lg:max-h-[calc(100vh-19rem)]">
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                  <div className="flex min-h-full flex-col gap-3">
                    {messages.length === 0 ? (
                      <div className="m-auto max-w-sm text-center text-sm leading-6 text-slate-500">
                        Try:{" "}
                        <span className="font-medium text-slate-700">
                          from Mission Dolores Park to Salesforce Tower
                        </span>
                      </div>
                    ) : null}
                    {messages.map((entry) => (
                      <Bubble key={entry.id} message={entry} />
                    ))}
                    {lastResponse?.suggestions && lastResponse.suggestions.length > 0 ? (
                      <div className="pt-1">
                        <p className="mb-2 text-[10px] uppercase tracking-[0.25em] text-slate-500">
                          Quick Retry
                        </p>
                        <SuggestionChips
                          suggestions={lastResponse.suggestions}
                          onPick={sendMessage}
                          isLoading={isLoading}
                        />
                      </div>
                    ) : null}
                    <div ref={transcriptEndRef} />
                  </div>
                </div>

                <div className="shrink-0 border-t border-slate-200 bg-white/85 p-4 backdrop-blur">
                  <form
                    className="flex flex-col gap-3 sm:flex-row"
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
                      placeholder="Ask for a ride..."
                      className="min-h-24 flex-1 resize-none rounded-[24px] border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-ember"
                    />
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="rounded-[24px] bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:self-end"
                    >
                      {isLoading ? "Working..." : "Send"}
                    </button>
                  </form>
                </div>
              </div>
            </div>

            <aside className="flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden">
              <ConfirmationGatePanel
                activeRide={activeRide}
                pendingProposal={pendingProposal}
                isLoading={isLoading}
                onDecision={confirmProposal}
                onCancel={cancelActiveRide}
              />

              {options.length > 0 ? (
                <div className="min-h-0 space-y-3">
                  <h2 className="font-display text-2xl text-ink">Current Options</h2>
                  <div className="grid max-h-[28vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-1">
                    {options.map((option) => (
                      <QuoteCard
                        key={option.optionId}
                        option={option}
                        onSelect={selectRideOption}
                        isSelected={
                          pendingProposal?.option.optionId === option.optionId
                        }
                        isLoading={isLoading}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-[36px] border border-white/70 bg-white/70 p-5 shadow-panel backdrop-blur sm:p-6">
          <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
            Action Log
          </p>
          <h2 className="mt-3 font-display text-3xl text-ink">
            Audit log
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            View what was requested, checked, executed, and what happened.
          </p>
          <div className="mt-6 min-h-0 flex-1 overflow-hidden">
            <ActionLog
              entries={session?.actionLog ?? []}
              isExpanded={isAuditLogExpanded}
              onToggle={() => setIsAuditLogExpanded((value) => !value)}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
