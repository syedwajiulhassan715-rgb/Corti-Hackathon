"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Bell, Check, ChevronLeft, ChevronRight, FileText, Pause, Play, Radio, RotateCcw } from "lucide-react";
import { DEMO_STEPS, getWard, momentForStep, resetDemo, type QueueRow, type WardResponse } from "@/lib/api";
import { WardFloorPlan } from "@/components/WardFloorPlan";
import { signed, vocabularyFor } from "@/lib/clinical";
import { PatientCommandPanel } from "@/components/PatientCommandPanel";

const STORY = [
  { label: "Baseline", title: "Ward state reconstructed", detail: "Historical observations establish each patient’s personal baseline." },
  { label: "Capture", title: "Nursing round captured", detail: "Routine observations enter the append-only event log before any conclusion is made." },
  { label: "Compare", title: "Trajectory recalculated", detail: "New measurements are compared with prior values, direction and duration." },
  { label: "Persist", title: "Sustained change detected", detail: "Repeated multi-signal evidence raises attention without reacting to a single noisy reading." },
  { label: "Prepare", title: "Care response prepared", detail: "ECHO exposes why now and prepares the next action for human approval." },
];

export default function WardPage() {
  const [step, setStep] = useState(1);
  const [ward, setWard] = useState<WardResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [showFlow, setShowFlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const until = momentForStep(step);

  useEffect(() => { let alive = true; getWard(until).then((data) => { if (!alive) return; setWard(data); setError(null); if (!pinned) setSelected(data.queue[0]?.patientId ?? null); }).catch((reason: Error) => alive && setError(reason.message)); return () => { alive = false; }; }, [until, pinned]);
  const advance = useCallback((by: number) => setStep((value) => Math.max(0, Math.min(DEMO_STEPS, value + by))), []);
  const reset = useCallback(async () => { await resetDemo(); setPlaying(false); setPinned(false); setSelected(null); setStep(0); }, []);
  const select = (patientId: string) => { setSelected(patientId); setPinned(true); };

  useEffect(() => { if (!playing) return; if (step >= DEMO_STEPS) { setPlaying(false); return; } const timer = window.setTimeout(() => advance(1), 2600); return () => window.clearTimeout(timer); }, [playing, step, advance]);
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === "ArrowRight") advance(1); if (event.key === "ArrowLeft") advance(-1); if (event.key.toLowerCase() === "r") void reset(); if (event.key === " ") { event.preventDefault(); setPlaying((value) => !value); } }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [advance, reset]);

  return <main className="min-h-screen bg-[#f2f4f3]">
    <Header ward={ward} step={step} setStep={setStep} advance={advance} reset={reset} playing={playing} setPlaying={setPlaying} showFlow={showFlow} setShowFlow={setShowFlow} />
    <LiveTicker ward={ward} step={step} playing={playing} />
    {error && <div className="m-5 border border-[var(--lvl-high)] bg-white p-4 text-tiny">Could not reach ECHO: {error}</div>}
    {showFlow && <LiveFlow step={step} playing={playing} onPlay={() => { setStep(0); setPlaying(true); }} />}
    <div key={step} className="ward-reveal grid min-h-[calc(100vh-105px)] xl:grid-cols-[minmax(680px,1fr)_440px]">
      <section className="border-r border-line p-4 md:p-5 xl:p-6 2xl:p-7">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">North ward · live spatial view</p><h2 className="mt-1 text-[clamp(24px,2.2vw,34px)] font-medium tracking-[-0.04em]">Every patient, at a glance</h2></div><p className="max-w-xs text-[11px] leading-relaxed text-dim sm:text-right">Select a room to inspect the patient. Press <b className="font-semibold text-ink">Play live round</b> to watch evidence become priority.</p></div>
        <div className="overflow-hidden rounded-2xl border border-[#ccd5d1] bg-white shadow-[0_24px_80px_rgba(29,50,43,0.09)]"><div className="flex h-12 items-center justify-between border-b border-ink px-5"><span className="text-[11px] font-semibold uppercase tracking-[0.12em]">Ward floor</span><span className="flex items-center gap-2 text-[10px] uppercase text-faint"><span className={`h-1.5 w-1.5 rounded-full bg-[var(--lvl-green)] ${playing ? "live-pulse" : ""}`} />{playing ? "round updating" : "monitoring live"}</span></div><WardFloorPlan rows={ward?.queue ?? []} selected={selected} onSelect={select} /></div>
        <AttentionTray rows={ward?.queue ?? []} selected={selected} onSelect={select} />
      </section>
      <aside className="bg-[#f8f9f8] p-4 md:p-5 xl:p-6"><div className="mb-4 flex h-10 items-center justify-between"><div className="flex items-center gap-2"><Bell size={15} className="text-[var(--accent)]" /><span className="text-[11px] font-semibold uppercase tracking-[0.12em]">Patient intelligence</span></div><span className="text-[10px] uppercase text-faint">select any room</span></div>{selected ? <PatientCommandPanel patientId={selected} until={until} /> : <div className="flex h-[70vh] items-center justify-center rounded-xl border border-line bg-white text-tiny text-faint">Select a room</div>}</aside>
    </div>
  </main>;
}

function Header({ ward, step, setStep, advance, reset, playing, setPlaying, showFlow, setShowFlow }: { ward: WardResponse | null; step: number; setStep: (step: number) => void; advance: (by: number) => void; reset: () => void; playing: boolean; setPlaying: (value: boolean) => void; showFlow: boolean; setShowFlow: (value: boolean) => void }) {
  // Everything that is not GREEN is something a nurse has to look at. Summing
  // only HIGH+CRITICAL printed "0 attention" on a board whose top row was
  // badged WATCH and ranked #1 -- the header contradicting the body.
  const watching = (ward?.counts.WATCH ?? 0) + (ward?.counts.PERSISTING_CONCERN ?? 0);
  const urgent = (ward?.counts.HIGH ?? 0) + (ward?.counts.CRITICAL ?? 0);
  const attention = watching + urgent;
  return <header className="sticky top-0 z-40 border-b border-ink bg-white/95 backdrop-blur-xl"><div className="relative flex h-[68px] items-center px-4 md:px-8"><a href="/ward/" className="text-[18px] font-medium uppercase tracking-[0.24em]">ECHO</a><nav className="absolute left-1/2 hidden h-full -translate-x-1/2 lg:flex"><Nav href="/ward/" active>Ward</Nav><button onClick={() => setShowFlow(!showFlow)} className={`flex items-center border-b-2 px-6 text-[10px] font-semibold uppercase tracking-[0.13em] ${showFlow ? "border-[var(--accent)] text-ink" : "border-transparent text-dim"}`}>How it works</button><Nav href="/demo/live/">Live pipeline</Nav><Nav href="/patients/elena_petrova/">Patient record</Nav></nav><div className="ml-auto flex items-center gap-3"><span className="hidden items-center gap-2 border-r border-line pr-4 text-[11px] font-medium text-dim sm:flex"><span className={`h-2 w-2 rounded-full ${urgent ? "bg-[var(--lvl-high)]" : attention ? "bg-[var(--lvl-watch)]" : "bg-[var(--lvl-green)]"}`} />{attention === 0 ? "All stable" : `${attention} need review`}</span><span className="border border-line bg-sunk px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-dim">Synthetic demo</span></div></div>
    <nav className="flex items-center gap-1 overflow-x-auto border-t border-line px-4 py-2 lg:hidden" aria-label="Sections">
      <SmallNav href="/ward/" active>Ward</SmallNav>
      <button onClick={() => setShowFlow(!showFlow)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium ${showFlow ? "bg-ink text-white" : "text-dim"}`}>How it works</button>
      <SmallNav href="/demo/live/">Live pipeline</SmallNav>
      <SmallNav href="/patients/elena_petrova/">Patient record</SmallNav>
    </nav>
    <div className="flex h-11 items-center gap-3 border-t border-line bg-[#f8f9f8] px-4 md:px-8"><button onClick={reset} className="text-faint hover:text-ink" title="Reset"><RotateCcw size={14} /></button><button onClick={() => advance(-1)} disabled={step <= 0} className="text-faint disabled:opacity-30"><ChevronLeft size={15} /></button><span className="hidden w-20 text-[10px] font-semibold uppercase text-dim sm:block">Day {step + 1} · {step * 4}h</span><input aria-label="Replay moment" type="range" min={0} max={DEMO_STEPS} value={step} onChange={(event) => { setPlaying(false); setStep(Number(event.target.value)); }} className="h-1 min-w-12 flex-1 accent-[var(--accent)]" /><button onClick={() => { if (!playing && step >= DEMO_STEPS) setStep(0); setPlaying(!playing); }} className={`flex min-w-[128px] items-center justify-center gap-2 rounded-lg px-3 py-2 text-[10px] font-semibold uppercase tracking-wide transition ${playing ? "bg-sunk text-ink" : "bg-[#173b35] text-white shadow-sm"}`}>{playing ? <Pause size={13} /> : <Play size={13} fill="currentColor" />}{playing ? "Pause round" : step >= DEMO_STEPS ? "Replay round" : "Play live round"}</button><button onClick={() => advance(1)} disabled={step >= DEMO_STEPS} className="hidden items-center gap-1.5 text-[10px] font-semibold uppercase text-[var(--accent)] disabled:opacity-30 sm:flex">Advance <ChevronRight size={14} /></button></div>
  </header>;
}

function LiveFlow({ step, playing, onPlay }: { step: number; playing: boolean; onPlay: () => void }) { const item = STORY[step]; return <section className="flow-enter border-b border-[#234d45] bg-[#102e28] px-4 py-5 text-white md:px-8"><div className="mx-auto flex max-w-[1660px] flex-col gap-5 lg:flex-row lg:items-center"><div className="flex min-w-[290px] items-center gap-4"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10">{playing ? <Radio className="live-pulse" size={18} /> : <Activity size={18} />}</span><div><p className="text-[9px] font-semibold uppercase tracking-[.18em] text-white/45">Live event projection</p><p className="mt-1 text-[16px] font-medium">{item.title}</p><p className="mt-1 max-w-md text-[11px] leading-relaxed text-white/60">{item.detail}</p></div></div><div className="flex flex-1 items-center overflow-x-auto pb-1 lg:justify-center">{STORY.map((stage, index) => <div key={stage.label} className="flex min-w-[105px] flex-1 items-center"><div className="flex flex-col items-center gap-2"><span className={`flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-semibold transition-all duration-500 ${index < step ? "border-[#77b5a7] bg-[#77b5a7] text-[#102e28]" : index === step ? "scale-110 border-white bg-white text-[#102e28] shadow-[0_0_0_6px_rgba(255,255,255,.08)]" : "border-white/20 text-white/35"}`}>{index < step ? <Check size={13} /> : index + 1}</span><span className={`text-[9px] font-semibold uppercase tracking-wide ${index <= step ? "text-white" : "text-white/30"}`}>{stage.label}</span></div>{index < STORY.length - 1 && <span className={`mb-5 h-px flex-1 transition-colors duration-700 ${index < step ? "bg-[#77b5a7]" : "bg-white/15"}`} />}</div>)}</div>{!playing && <button onClick={onPlay} className="flex shrink-0 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-[10px] font-semibold uppercase tracking-wide hover:bg-white/15"><Play size={12} fill="currentColor" />Run from start</button>}</div></section>; }
function SmallNav({ children, href, active }: { children: React.ReactNode; href: string; active?: boolean }) { return <a href={href} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium ${active ? "bg-ink text-white" : "text-dim"}`}>{children}</a>; }
function Nav({ children, href, active }: { children: React.ReactNode; href: string; active?: boolean }) { return <a href={href} className={`flex items-center border-b-2 px-7 text-[10px] font-semibold uppercase tracking-[0.13em] ${active ? "border-[var(--accent)]" : "border-transparent text-dim hover:text-ink"}`}>{children}</a>; }
function LiveTicker({ ward, step, playing }: { ward: WardResponse | null; step: number; playing: boolean }) { const patient = ward?.queue[0]; const updates = [patient ? `${patient.room?.replace("room-", "R")} · ${patient.name} trajectory recalculated` : "Ward baseline reconstructed", step > 1 ? "Nursing observation received" : "All monitored patients compared with baseline", step >= 3 ? "Persistence requirement met · attention queue updated" : "No premature escalation", step >= 4 ? "Care response prepared for review" : "Care workflow monitored"]; return <div className="flex h-9 items-center overflow-hidden border-b border-line bg-white px-4 md:px-8"><span className="mr-5 flex shrink-0 items-center gap-2 text-[9px] font-bold uppercase tracking-[.14em] text-[var(--accent)]"><span className={`h-1.5 w-1.5 rounded-full bg-[var(--lvl-green)] ${playing ? "live-pulse" : ""}`} />Live · {ward?.queue.length ?? 0} patients</span><div key={`${step}-${playing}`} className="ticker-enter min-w-0 flex-1 truncate text-[10px] text-dim">{updates[Math.min(step, updates.length - 1)]}</div><span className="hidden shrink-0 text-[9px] uppercase tracking-wide text-faint sm:block">event log · {ward?.generated_from_events ?? 0} events</span></div>; }
/**
 * The attention queue: rank, bed, name, level, and the single reading that
 * moved most. One line each.
 *
 * It used to print the same why-now sentence the floor tile and the right-hand
 * panel were already printing, so one screen said the identical thing three
 * times -- and at eleven calm patients it rendered as a lone orphaned card
 * under a four-column grid. Rank is the one fact the spatial view genuinely
 * cannot show, so rank is what this earns its place with.
 */
function AttentionTray({ rows, selected, onSelect }: { rows: readonly QueueRow[]; selected: string | null; onSelect: (id: string) => void }) {
  const attention = rows.filter((row) => row.level !== "GREEN" || row.locationStatus !== "bed").slice(0, 4);
  if (attention.length === 0) return <p className="mt-4 text-[11px] text-faint">Every patient is tracking their own baseline. Nothing needs review.</p>;
  return <div className="mt-4">
    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Attention queue</p>
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {attention.map((row) => {
        const top = row.signals.filter((signal) => signal.concerning).sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))[0];
        const token = row.level === "PERSISTING_CONCERN" ? "concern" : row.level.toLowerCase();
        return <li key={row.patientId}>
          <button onClick={() => onSelect(row.patientId)} className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-sunk ${selected === row.patientId ? "bg-sunk" : ""}`}>
            <span className="w-6 shrink-0 font-mono text-[11px] text-faint">#{row.rank}</span>
            <span className="w-8 shrink-0 font-mono text-[11px] text-faint">{row.room?.replace("room-", "R") ?? "--"}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{row.name}</span>
            {top !== undefined && <span className="hidden shrink-0 items-center gap-1 text-[11px] tabular-nums text-dim sm:flex">{vocabularyFor(top.observation).short}<b className="font-semibold text-ink">{top.current}</b>{top.delta !== null && <span style={{ color: "var(--lvl-high)" }}>{signed(top.delta)}</span>}</span>}
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: `var(--lvl-${token})` }}>{row.locationStatus !== "bed" ? `On ${row.locationStatus}` : LADDER[row.level] ?? row.level}</span>
          </button>
        </li>;
      })}
    </ul>
  </div>;
}
const LADDER: Readonly<Record<string, string>> = { GREEN: "Stable", WATCH: "Watch", PERSISTING_CONCERN: "Persisting", HIGH: "Attention", CRITICAL: "Critical" };
