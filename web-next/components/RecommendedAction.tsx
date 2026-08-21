"use client";

// The last beat of the demo, and the only control in the app that changes state.
//
// THE HUMAN IS THE ACTUATOR. ECHO proposes; nothing happens until someone
// presses a button. That is not a UX preference, it is the product's safety
// argument, so the buttons say what will be recorded and the recorded text is
// the operator's own words when they give them.

import { useState } from "react";
import { decide, type Proposal } from "@/lib/api";

export function RecommendedAction({
  proposal,
  until,
  onDecided,
  decideAction,
}: {
  proposal: Proposal;
  until: number;
  onDecided: () => void;
  decideAction?: (input: { proposalId: string; approved: boolean; note?: string }) => Promise<unknown>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const settled = proposal.status !== "pending";

  async function send(approved: boolean) {
    setBusy(true);
    setError(null);
    try {
      const input = { proposalId: proposal.id, approved, ...(note ? { note } : {}) };
      if (decideAction) await decideAction(input);
      else await decide({ ...input, until });
      onDecided();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-[var(--accent)]/40 bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-micro font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
          ECHO recommends
        </h3>
        <span className="text-micro uppercase text-faint">
          {proposal.generated ? "rationale by Corti" : "rationale deterministic"}
        </span>
      </div>

      <p className="mt-2 text-[14px] font-medium leading-snug">{proposal.summary}</p>
      <p className="mt-1.5 text-tiny leading-relaxed text-dim">{proposal.rationale}</p>

      <div className="mt-3 grid gap-2 border-y border-line py-3 sm:grid-cols-3">
        <Resource label="Nurse" value={proposal.coordination.nurse?.name ?? "Unavailable"} />
        <Resource label="Clinician" value={proposal.coordination.clinician?.name ?? "Unavailable"} />
        <Resource label="Next slot" value={proposal.coordination.nextSlot?.label ?? "No slot"} />
      </div>
      <p className="mt-1.5 text-micro uppercase text-faint">
        Availability · workload · appointment checked via {proposal.coordination.source}
      </p>
      {proposal.coordination.degradedReason && (
        <p className="mt-1 text-tiny text-[var(--lvl-watch)]">{proposal.coordination.degradedReason}</p>
      )}

      {settled ? (
        <p className="mt-3 border-t border-line pt-2 text-tiny text-dim">
          {proposal.status === "approved" ? "Approved" : "Rejected"} — recorded in the
          patient&rsquo;s history as an action event.
        </p>
      ) : (
        <div className="mt-3 border-t border-line pt-3">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note — recorded verbatim, in your words"
            className="w-full rounded-md border border-line bg-sunk px-2.5 py-1.5 text-tiny outline-none placeholder:text-faint focus:border-dim"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => send(true)}
              disabled={busy}
              className="rounded-md border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-tiny font-medium text-white disabled:opacity-40"
            >
              Approve
            </button>
            <button
              onClick={() => send(false)}
              disabled={busy}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-tiny font-medium disabled:opacity-40"
            >
              Reject
            </button>
          </div>
          {error && <p className="mt-2 text-tiny text-[var(--lvl-high)]">{error}</p>}
        </div>
      )}
    </div>
  );
}

function Resource({ label, value }: { label: string; value: string }) {
  return <div><p className="text-micro uppercase text-faint">{label}</p><p className="mt-0.5 text-tiny font-medium">{value}</p></div>;
}
