"use client";

import { useEffect, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { getPatient, type PatientResponse, type TrendSignal } from "@/lib/api";
import { humanise } from "@/lib/clinical";
import { LevelBadge } from "@/components/LevelBadge";
import { PatientPanel } from "@/components/PatientPanel";
import { CareGapVisual, WhatChanged, WhyNow } from "@/components/PatientStory";

const LABEL: Record<string, string> = { systolic_bp: "BP", heart_rate: "HR", spo2: "SpO₂", respiratory_rate: "RR", temperature: "Temp" };
const UNIT: Record<string, string> = { systolic_bp: "mmHg", heart_rate: "bpm", spo2: "%", respiratory_rate: "/min", temperature: "°C" };

export function PatientCommandPanel({ patientId, until }: { patientId: string; until: number }) {
  const [data, setData] = useState<PatientResponse | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { let alive = true; getPatient(patientId, until).then((value) => alive && setData(value)); return () => { alive = false; }; }, [patientId, until]);
  if (!data) return <div className="h-[70vh] animate-pulse border border-line bg-surface" />;
  const signals = data.trends.signals.filter((signal) => signal.sampleCount > 0 && LABEL[signal.observation]).slice(0, 5);
  const priority = data.priority;
  return <>
    <div className="border border-line bg-surface">
      <div className="flex items-start justify-between border-b border-ink px-6 py-5">
        <div><p className="text-micro font-semibold uppercase tracking-[0.12em] text-faint">Selected patient · {data.patient.room}</p><h2 className="mt-1 text-[25px] font-medium tracking-tight">{data.patient.name}</h2><p className="mt-1 text-tiny text-dim">{data.patient.summary} · synthetic bed assignment</p></div>
        {priority && <div className="text-right"><LevelBadge level={priority.level}/><p className="mt-2 text-micro uppercase text-faint">Ward priority #{priority.rank}</p></div>}
      </div>

      <div className="grid grid-cols-2 border-b border-line sm:grid-cols-5">
        {signals.map((signal) => <Vital key={signal.observation} signal={signal} />)}
      </div>

      <WhatChanged data={data} />
      <WhyNow data={data} compact />
      <CareGapVisual data={data} />

      <div className="flex items-center justify-between border-t border-ink px-6 py-4"><div><p className="text-micro font-semibold uppercase tracking-[0.12em] text-faint">Why this patient now</p><p className="mt-1 max-w-2xl text-tiny text-dim">{humanise(priority?.reasons[0] ?? "No meaningful change from this patient’s baseline.")}</p></div><button onClick={() => setOpen(true)} className="flex items-center gap-2 border border-[var(--accent)] px-4 py-2 text-tiny font-semibold text-[var(--accent)]">Open patient workflow <ChevronRight size={14}/></button></div>
    </div>
    {open && <div className="fixed inset-0 z-50 bg-ink/25 backdrop-blur-[2px]" onClick={() => setOpen(false)}><aside className="ml-auto h-full w-full max-w-3xl overflow-y-auto bg-canvas p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="sticky top-0 z-10 mb-4 flex items-center justify-between border-b border-ink bg-canvas pb-3"><div><p className="text-micro uppercase text-faint">Patient workflow</p><p className="text-[17px] font-medium">Evidence, documentation and prepared action</p></div><button onClick={() => setOpen(false)} aria-label="Close patient workflow" className="border border-line bg-surface p-2"><X size={16}/></button></div><PatientPanel patientId={patientId} until={until}/></aside></div>}
  </>;
}

function Vital({ signal }: { signal: TrendSignal }) { return <div className="border-r border-line px-4 py-4 last:border-r-0"><p className="text-micro font-semibold uppercase text-faint">{LABEL[signal.observation]}</p><div className="mt-2 flex items-baseline gap-1"><span className={`text-[24px] font-medium tabular ${signal.concerning ? "text-[var(--lvl-high)]" : ""}`}>{signal.current ?? "—"}</span><span className="text-micro text-faint">{UNIT[signal.observation]}</span></div><p className="mt-1 text-micro text-faint">{signal.direction}</p></div>; }
