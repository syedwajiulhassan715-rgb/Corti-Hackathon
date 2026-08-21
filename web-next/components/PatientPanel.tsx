"use client";

// The selected patient: what changed, why it counts, and who said so.
//
// ORDER IS THE ARGUMENT. Numbers, then the trend behind the numbers, then the
// receipt, then the words. A clinician who stops reading after the first
// section has still seen the reading; one who reads to the bottom has seen the
// quote it rests on. Nothing here is decorative and nothing is behind a tab —
// a claim and its evidence must be visible together or the evidence may as
// well not exist.
//
// WHY THE "WHY NOT" PANEL IS HERE AT ALL. Every ward product over-alerts, so
// clinicians assume any AI board is crying wolf. Showing what ECHO deliberately
// did NOT escalate, with the reason, is the cheapest credibility we can buy.

import { humanise, vocabularyFor } from "@/lib/clinical";
import { useEffect, useState } from "react";
import {
  getPatient,
  getProposals,
  recordObservation,
  type PatientResponse,
  type Proposal,
  type TrendSignal,
} from "@/lib/api";
import { LevelBadge } from "@/components/LevelBadge";
import { Sparkline } from "@/components/Sparkline";
import { RecommendedAction } from "@/components/RecommendedAction";
import { PatientAssistant } from "@/components/PatientAssistant";
import { CareGapVisual, WhatChanged, WhyNow } from "@/components/PatientStory";

const LABEL: Record<string, string> = {
  systolic_bp: "Systolic",
  diastolic_bp: "Diastolic",
  heart_rate: "Heart rate",
  spo2: "SpO₂",
  respiratory_rate: "Resp rate",
  temperature: "Temp",
};

const UNIT: Record<string, string> = {
  systolic_bp: "mmHg",
  diastolic_bp: "mmHg",
  heart_rate: "bpm",
  spo2: "%",
  respiratory_rate: "/min",
  temperature: "°C",
};

export function PatientPanel({ patientId, until }: { patientId: string; until: number }) {
  const [data, setData] = useState<PatientResponse | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped after a decision so the panel refolds and shows the new action
  // event alongside the now-settled proposal.
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    getPatient(patientId, until)
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e: Error) => !cancelled && setError(e.message));

    // A missing proposal panel is normal — most patients need nothing — so a
    // failure here must never take the rest of the page with it.
    getProposals(until)
      .then((r) => !cancelled && setProposal(r.proposals.find((p) => p.patientId === patientId) ?? null))
      .catch(() => !cancelled && setProposal(null));

    return () => {
      cancelled = true;
    };
  }, [patientId, until, revision]);

  if (error) return <Card><p className="text-tiny text-dim">Could not load {patientId}.</p></Card>;
  if (!data) return <div className="h-64 animate-pulse rounded-xl border border-line bg-sunk" />;

  const { patient, priority, trends, history, role, care } = data;
  const tracked = trends.signals.filter((s) => s.sampleCount > 0);
  const speech = data.events.filter((e) => e.source === "speech" && e.quote.trim() !== "");
  const actions = data.events.filter((e) => e.source === "action");

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[19px] font-semibold leading-tight">{patient.name}</h2>
            <p className="mt-0.5 text-tiny text-dim">
              {patient.summary} · MRN {patient.mrn} · {patient.room ?? "unassigned"}
              {patient.simulated && (
                <span className="ml-2 text-faint">bed assignment simulated</span>
              )}
            </p>
          </div>
          {priority && (
            <div className="text-right">
              <LevelBadge level={priority.level} />
              <p className="mt-1 text-micro uppercase text-faint tabular">
                rank #{priority.rank} · score {priority.score}
              </p>
            </div>
          )}
        </div>

        {tracked.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 border-t border-line pt-3">
            {tracked.map((s) => (
              <Vital key={s.observation} signal={s} />
            ))}
          </div>
        )}
      </Card>

      {tracked.length > 0 && (
        <Card>
          <Title>Trends — against this patient&rsquo;s own baseline</Title>
          <div className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {tracked.map((s) => (
              <div key={s.observation}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-tiny font-medium">{LABEL[s.observation] ?? vocabularyFor(s.observation).label}</span>
                  <Delta signal={s} />
                </div>
                <Sparkline
                  points={history.series[s.observation] ?? []}
                  baseline={s.baseline}
                  concerning={s.concerning}
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {priority && priority.components.length > 0 && (
        <Card>
          <Title>Why now</Title>
          <p className="mt-1 text-tiny text-faint">
            Every point is shown. There is no hidden score.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {priority.components.map((c, i) => (
              <li key={i} className="flex gap-3 border-l-2 border-line pl-3">
                <span className="w-9 shrink-0 text-tiny font-semibold text-[var(--accent)] tabular">
                  +{c.points}
                </span>
                <div className="min-w-0">
                  <p className="text-tiny leading-snug">{humanise(c.explanation)}</p>
                  <p className="mt-0.5 text-micro uppercase text-faint">
                    {c.name} · {c.evidenceEventIds.length} event
                    {c.evidenceEventIds.length === 1 ? "" : "s"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-baseline gap-2 border-t border-line pt-2 text-tiny">
            <span className="text-faint uppercase text-micro">Total</span>
            <span className="font-semibold tabular">{priority.score}</span>
          </div>
        </Card>
      )}

      {care.gaps.length > 0 && (
        <Card>
          <Title>Care gaps</Title>
          <p className="mt-1 text-tiny text-faint">Patient state moved faster than documented workflow.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {care.gaps.map((gap) => (
              <li key={gap.id} className="border-l-2 border-[var(--lvl-watch)] pl-3">
                <p className="text-tiny font-medium">{gap.summary}</p>
                <p className="mt-0.5 text-tiny leading-snug text-dim">{gap.whyNow}</p>
                <p className="mt-0.5 text-micro uppercase text-faint">{gap.kind.replace(/-/g, " ")} · {gap.evidenceEventIds.length} evidence event{gap.evidenceEventIds.length === 1 ? "" : "s"}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {proposal && (
        <RecommendedAction
          proposal={proposal}
          until={until}
          onDecided={() => setRevision((r) => r + 1)}
        />
      )}

      {actions.length > 0 && (
        <Card>
          <Title>Actions taken</Title>
          <ul className="mt-2 flex flex-col gap-1.5">
            {actions.map((e) => (
              <li key={e.id} className="border-l-2 border-[var(--accent)] pl-3">
                <p className="text-tiny leading-snug">&ldquo;{e.quote}&rdquo;</p>
                <p className="mt-0.5 text-micro uppercase text-faint tabular">
                  {e.observation} · {String(e.value)} ·{" "}
                  {new Date(e.ts).toISOString().slice(11, 16)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {priority && priority.withheld.length > 0 && (
        <Card muted>
          <Title>Why not earlier</Title>
          <p className="mt-1 text-tiny text-faint">ECHO held the previous level until these evidence requirements were met.</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {priority.withheld.map((w, i) => (
              <li key={i} className="text-tiny leading-snug text-dim">
                {w}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <Title>Longitudinal timeline</Title>
        <ul className="mt-3 flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
          {[...data.events].sort((a, b) => b.ts - a.ts).map((event) => (
            <li key={event.id} className="grid grid-cols-[58px_1fr] gap-3 border-l-2 border-line pl-3">
              <time className="text-micro text-faint tabular">{new Date(event.ts).toISOString().slice(11, 16)}</time>
              <div>
                <p className="text-tiny leading-snug">
                  {event.quote.trim() || `${event.observation}: ${String(event.value ?? "recorded")}`}
                </p>
                <p className="mt-0.5 text-micro uppercase text-faint">{event.source} · {event.observation}{event.code ? ` · ${event.code}` : ""}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <WhyNow data={data} />
      <WhatChanged data={data} />
      <CareGapVisual data={data} />

      <NurseRound
        patientId={patientId}
        until={until}
        onRecorded={() => setRevision((r) => r + 1)}
      />

      <PatientAssistant data={data} proposal={proposal} />

      {speech.length > 0 && (
        <Card>
          <Title>Conversation evidence</Title>
          <ul className="mt-3 flex flex-col gap-2.5">
            {speech.map((e) => (
              <li key={e.id} className="border-l-2 border-line pl-3">
                <p className="text-tiny leading-snug">&ldquo;{e.quote}&rdquo;</p>
                <p className="mt-0.5 text-micro uppercase text-faint tabular">
                  {e.speaker} · {new Date(e.ts).toISOString().slice(11, 16)}
                  {e.code && <span className="ml-2 font-mono normal-case">{e.code}</span>}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {history.conditions.length > 0 && (
        <Card>
          <Title>Problem list</Title>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {history.conditions.map((c) => (
              <li key={c.code} className="text-tiny text-dim">
                {c.label} <span className="font-mono text-faint">{c.code}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {role && (
        <p className="px-1 text-micro leading-relaxed text-faint">
          <span className="uppercase">Simulated arc</span> — {role.note}
        </p>
      )}
    </div>
  );
}

function Vital({ signal }: { signal: TrendSignal }) {
  const arrow = signal.direction === "worsening" ? "↑" : signal.direction === "improving" ? "↓" : "";
  const bad = signal.concerning;
  return (
    <div>
      <div className="flex items-baseline gap-1">
        <span
          className="text-[21px] font-semibold leading-none tabular"
          style={bad ? { color: "var(--lvl-high)" } : undefined}
        >
          {signal.current ?? "—"}
        </span>
        {arrow && (
          <span className="text-tiny" style={bad ? { color: "var(--lvl-high)" } : { color: "var(--faint)" }}>
            {signal.observation === "spo2" && signal.direction === "worsening" ? "↓" : arrow}
          </span>
        )}
        <span className="text-micro text-faint">{UNIT[signal.observation] ?? ""}</span>
      </div>
      <div className="mt-0.5 text-micro uppercase text-faint">
        {LABEL[signal.observation] ?? vocabularyFor(signal.observation).label}
      </div>
    </div>
  );
}

function Delta({ signal }: { signal: TrendSignal }) {
  if (signal.delta === null || signal.baseline === null) {
    return <span className="text-micro text-faint">no baseline</span>;
  }
  const sign = signal.delta > 0 ? "+" : "";
  return (
    <span
      className="text-micro tabular"
      style={{ color: signal.concerning ? "var(--lvl-high)" : "var(--faint)" }}
    >
      {sign}
      {Math.round(signal.delta * 10) / 10} from {signal.baseline}
    </span>
  );
}

function Card({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div
      className={[
        "border border-line p-4",
        muted ? "bg-sunk" : "bg-surface",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-micro font-semibold uppercase tracking-[0.1em] text-faint">{children}</h3>
  );
}

function NurseRound({
  patientId,
  until,
  onRecorded,
}: {
  patientId: string;
  until: number;
  onRecorded: () => void;
}) {
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [spo2, setSpo2] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const vitals = Object.fromEntries(
      [
        ["systolic_bp", systolic],
        ["diastolic_bp", diastolic],
        ["heart_rate", heartRate],
        ["spo2", spo2],
      ]
        .filter(([, value]) => value !== "")
        .map(([name, value]) => [name, Number(value)]),
    );
    setBusy(true);
    setMessage(null);
    try {
      const requestId = `round-${patientId}-${until}-${systolic}-${diastolic}-${heartRate}-${spo2}-${note}`;
      const result = await recordObservation({ requestId, patientId, observedAt: until, note, vitals });
      setMessage(`History updated automatically · ${result.eventIds.length} event${result.eventIds.length === 1 ? "" : "s"} recorded`);
      setSystolic(""); setDiastolic(""); setHeartRate(""); setSpo2(""); setNote("");
      onRecorded();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Title>Nurse round · ordinary work becomes history</Title>
      <form onSubmit={submit} className="mt-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <VitalInput label="BP systolic" value={systolic} onChange={setSystolic} min={40} max={300} />
          <VitalInput label="BP diastolic" value={diastolic} onChange={setDiastolic} min={20} max={200} />
          <VitalInput label="Heart rate" value={heartRate} onChange={setHeartRate} min={20} max={250} />
          <VitalInput label="SpO₂" value={spo2} onChange={setSpo2} min={50} max={100} />
        </div>
        <label className="mt-2 block text-micro font-medium uppercase text-faint">
          Observation
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="Patient feels more tired than yesterday."
            className="mt-1 w-full resize-none rounded-md border border-line bg-sunk px-2.5 py-2 text-tiny normal-case outline-none placeholder:text-faint focus:border-dim"
          />
        </label>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || (!systolic && !diastolic && !heartRate && !spo2 && !note.trim())}
            className="rounded-md border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-tiny font-medium text-white disabled:opacity-40"
          >
            {busy ? "Recording…" : "Save check"}
          </button>
          {message && <p role="status" className="text-tiny text-dim">{message}</p>}
        </div>
      </form>
    </Card>
  );
}

function VitalInput({ label, value, onChange, min, max }: { label: string; value: string; onChange: (value: string) => void; min: number; max: number }) {
  return (
    <label className="text-micro font-medium uppercase text-faint">
      {label}
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        min={min}
        max={max}
        className="mt-1 w-full rounded-md border border-line bg-sunk px-2.5 py-2 text-tiny normal-case tabular outline-none focus:border-dim"
      />
    </label>
  );
}
