"use client";

import { useMemo, useState } from "react";
import { Bot, FileCheck2, Send, Sparkles } from "lucide-react";
import type { PatientResponse, Proposal } from "@/lib/api";

const PROMPTS = ["What changed?", "Why #1?", "Summarize last 24h", "Open tasks", "Prepare handoff"] as const;

export function PatientAssistant({ data, proposal }: { data: PatientResponse; proposal: Proposal | null }) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const evidence = useMemo(() => new Map(data.events.map((event) => [event.id, event])), [data.events]);

  function ask(value: string) {
    if (!value.trim()) return;
    setBusy(true);
    window.setTimeout(() => { setAnswer(buildAnswer(value, data, proposal)); setBusy(false); setQuery(""); }, 420);
  }

  return <section className="echo-assistant overflow-hidden border border-[#b9cbc5] bg-white shadow-[0_18px_55px_rgba(25,50,43,.08)]">
    <header className="flex items-center justify-between border-b border-[#183e37] bg-[#143a33] px-5 py-4 text-white"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"><Bot size={17} /></span><div><p className="text-[9px] font-semibold uppercase tracking-[.16em] text-white/50">Ask ECHO about this patient</p><p className="mt-0.5 text-[13px] font-medium">Grounded in {data.events.length} timeline events</p></div></div><span className="flex items-center gap-1.5 text-[9px] uppercase tracking-wide text-white/50"><span className="h-1.5 w-1.5 rounded-full bg-[#7bc0ad]" />patient context active</span></header>
    <div className="p-5">
      <div className="flex flex-wrap gap-2">{PROMPTS.map((prompt) => <button key={prompt} onClick={() => ask(prompt)} className="rounded-full border border-line bg-[#f7f8f7] px-3 py-1.5 text-[10px] font-medium text-dim transition hover:-translate-y-px hover:border-[#78978d] hover:bg-white hover:text-ink">{prompt}</button>)}</div>
      <div className="mt-4 min-h-[120px] border-l border-[#9db7ae] pl-5">
        {busy ? <div className="flex items-center gap-2 py-6 text-[11px] text-dim"><span className="echo-thinking h-2 w-14 rounded-full bg-[#8db1a6]" />Tracing grounded history…</div> : answer ? <div className="assistant-answer"><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[.14em] text-[var(--accent)]"><Sparkles size={12} />ECHO response</div><p className="mt-2 text-[14px] font-medium leading-relaxed text-ink">{answer.headline}</p>{answer.lines.map((line) => <p key={line} className="mt-1.5 text-[11px] leading-relaxed text-dim">{line}</p>)}<div className="mt-4 flex flex-wrap gap-2">{answer.evidenceIds.slice(0, 4).map((id) => { const event = evidence.get(id); return <span key={id} title={event?.quote} className="flex items-center gap-1.5 border-b border-[#9db7ae] pb-0.5 text-[9px] font-medium text-[var(--accent)]"><FileCheck2 size={11} />{event ? `${event.source} · ${new Date(event.ts).toISOString().slice(11, 16)}` : id}</span>; })}</div></div> : <div className="py-4"><p className="text-[14px] font-medium">Ask a clinical workflow question.</p><p className="mt-1 text-[11px] leading-relaxed text-dim">Answers cite the observations, conversations and tasks already present in this patient’s event history.</p></div>}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); ask(query); }} className="mt-4 flex items-center border-t border-line pt-4"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="When did oxygen saturation start falling?" className="min-w-0 flex-1 bg-transparent py-2 text-[12px] outline-none placeholder:text-faint" /><button disabled={!query.trim() || busy} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#173b35] text-white transition hover:scale-105 disabled:opacity-30" aria-label="Ask ECHO"><Send size={14} /></button></form>
    </div>
  </section>;
}

type Answer = { headline: string; lines: string[]; evidenceIds: string[] };
function buildAnswer(question: string, data: PatientResponse, proposal: Proposal | null): Answer {
  const q = question.toLowerCase(); const priority = data.priority; const concerning = data.trends.signals.filter((signal) => signal.concerning); const eventIds = [...new Set(concerning.flatMap((signal) => signal.evidenceEventIds))];
  if (q.includes("task")) { const open = data.care.tasks.filter((task) => task.status !== "completed"); return { headline: open.length ? `${open.length} task${open.length === 1 ? "" : "s"} still require attention.` : "No unresolved tasks are currently recorded.", lines: open.map((task) => `${task.status.toUpperCase()} · ${task.summary}`), evidenceIds: open.flatMap((task) => task.evidenceEventIds) }; }
  if (q.includes("handoff") || q.includes("prepare")) return { headline: `Handoff prepared for ${data.patient.name}.`, lines: [`Current state: ${priority?.level.replace(/_/g, " ") ?? "stable"}, ward priority #${priority?.rank ?? "—"}.`, concerning.length ? `Key change: ${concerning.map((signal) => `${signal.observation} ${signal.direction}`).join(", ")}.` : "No sustained concerning trajectory detected.", proposal ? `Next step: ${proposal.summary}` : "No workflow-changing action is currently proposed."], evidenceIds: priority?.evidenceEventIds ?? [] };
  if (q.includes("why") || q.includes("#1")) return { headline: priority ? `${data.patient.name} is priority #${priority.rank} because evidence persisted and agreed over time.` : "This patient is not currently in the attention queue.", lines: priority?.reasons.slice(0, 3) ?? [], evidenceIds: priority?.evidenceEventIds ?? [] };
  if (q.includes("oxygen") || q.includes("spo") || q.includes("blood pressure") || q.includes("trend")) { const signal = data.trends.signals.find((item) => q.includes("oxygen") || q.includes("spo") ? item.observation === "spo2" : item.observation.includes("bp")) ?? concerning[0]; return signal ? { headline: `${signal.observation.replace(/_/g, " ")} moved from ${signal.baseline ?? "unknown baseline"} to ${signal.current ?? "unknown"}.`, lines: [`Direction: ${signal.direction}. Persistence: ${Math.round(signal.persistenceMs / 60000)} minutes across ${signal.sampleCount} readings.`], evidenceIds: signal.evidenceEventIds } : { headline: "No matching trend is recorded.", lines: [], evidenceIds: [] }; }
  const speech = data.events.filter((event) => event.source === "speech").slice(-2); return { headline: concerning.length ? `${concerning.length} clinically meaningful signal${concerning.length === 1 ? " has" : "s have"} changed from baseline.` : "No sustained deterioration is currently visible.", lines: [...concerning.slice(0, 3).map((signal) => `${signal.observation.replace(/_/g, " ")}: ${signal.baseline ?? "—"} → ${signal.current ?? "—"} (${signal.direction}).`), ...speech.map((event) => `Reported: “${event.quote}”`)], evidenceIds: [...eventIds, ...speech.map((event) => event.id)] };
}
