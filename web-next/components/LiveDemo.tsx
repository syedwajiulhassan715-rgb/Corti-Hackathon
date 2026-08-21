"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  AudioLines,
  Bell,
  Check,
  ChevronRight,
  CircleStop,
  FileCheck2,
  FileClock,
  HeartPulse,
  Mic,
  MonitorUp,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  advanceDemoMonitor,
  createDemoRun,
  decideDemoRun,
  endDemoEncounter,
  getDemoRun,
  resetDemo,
  sendDemoAudio,
  type DemoActivity,
  type DemoAttribution,
  type DemoRunSnapshot,
  type EchoEvent,
  type Proposal,
  type TrendSignal,
} from "@/lib/api";
import { LevelBadge } from "@/components/LevelBadge";
import { RecommendedAction } from "@/components/RecommendedAction";

const HERO = "elena_petrova";
const STAGES = ["Encounter", "Memory", "Monitor", "Why now", "Action"];
const SUPPORTED_AUDIO = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"];

export function LiveDemo() {
  const [run, setRun] = useState<DemoRunSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [inspector, setInspector] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [meter, setMeter] = useState<number[]>(() => Array.from({ length: 24 }, () => 0.08));
  const [evidenceId, setEvidenceId] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve());
  const uploadFailureRef = useRef<Error | null>(null);
  const audioSequenceRef = useRef(0);
  const runId = run?.runId;

  const refresh = useCallback(async () => {
    if (!runId) return;
    try {
      setRun(await getDemoRun(runId));
    } catch {
      // A transient poll failure never overwrites the last atomic snapshot.
    }
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    const timer = window.setInterval(() => void refresh(), 700);
    return () => window.clearInterval(timer);
  }, [refresh, runId]);

  useEffect(() => {
    if (run?.status !== "recording" || captureFailed) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [captureFailed, run?.status]);

  useEffect(() => () => cleanupMedia(), []);

  const evidence = useMemo(() => {
    const rows = [...(run?.evidenceEvents ?? []), ...(run?.events ?? [])];
    return new Map(rows.map((event) => [event.id, event]));
  }, [run?.events, run?.evidenceEvents]);

  async function startLive() {
    setBusy(true);
    setError(null);
    setCaptureFailed(false);
    setSeconds(0);
    uploadFailureRef.current = null;
    uploadChainRef.current = Promise.resolve();
    audioSequenceRef.current = 0;

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("This browser does not provide microphone recording.");
      }
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      mediaRef.current = media;
      const mimeType = SUPPORTED_AUDIO.find((value) => MediaRecorder.isTypeSupported(value));
      if (!mimeType) throw new Error("This browser cannot record a Corti-supported audio format.");

      const nextRecorder = new MediaRecorder(media, { mimeType, audioBitsPerSecond: 48_000 });
      const created = await createDemoRun({ patientId: HERO, mode: "live", audioFormat: nextRecorder.mimeType });
      setRun(created);
      if (created.status === "failed") {
        setCaptureFailed(true);
        throw new Error(created.error ?? "Live Corti connection failed.");
      }

      nextRecorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        const sequence = audioSequenceRef.current++;
        uploadChainRef.current = uploadChainRef.current.then(async () => {
          if (uploadFailureRef.current) return;
          try {
            await sendDemoAudio(created.runId, sequence, event.data);
          } catch (reason) {
            const failure = reason as Error;
            uploadFailureRef.current = failure;
            setCaptureFailed(true);
            setError(failure.message);
          }
        });
      };
      nextRecorder.onerror = () => {
        const failure = new Error("Browser microphone capture failed.");
        uploadFailureRef.current = failure;
        setCaptureFailed(true);
        setError(failure.message);
      };
      recorderRef.current = nextRecorder;
      startMeter(media);
      nextRecorder.start(500);
    } catch (reason) {
      setError((reason as Error).message);
      setCaptureFailed(true);
      cleanupMedia();
    } finally {
      setBusy(false);
    }
  }

  async function stopLive() {
    if (!run || !recorderRef.current) return;
    setBusy(true);
    setError(null);
    const active = recorderRef.current;
    try {
      const stopped = new Promise<void>((resolve) => active.addEventListener("stop", () => resolve(), { once: true }));
      if (active.state !== "inactive") {
        active.requestData();
        active.stop();
        await stopped;
      }
      await uploadChainRef.current;
      if (uploadFailureRef.current) throw uploadFailureRef.current;
      stopMeter();
      mediaRef.current?.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
      mediaRef.current = null;
      setRun(await endDemoEncounter(run.runId));
    } catch (reason) {
      setCaptureFailed(true);
      setError(`${(reason as Error).message} The encounter was not presented as complete.`);
    } finally {
      setBusy(false);
    }
  }

  async function startRecorded() {
    setBusy(true);
    setError(null);
    setCaptureFailed(false);
    cleanupMedia();
    try {
      const created = await createDemoRun({ patientId: HERO, mode: "recorded" });
      setRun(await getDemoRun(created.runId));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function advanceMonitor() {
    if (!run) return;
    setBusy(true);
    setError(null);
    try {
      await advanceDemoMonitor(run.runId, run.monitorStep);
      await refresh();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    uploadFailureRef.current = new Error("Demo reset by presenter.");
    cleanupMedia();
    try {
      await uploadChainRef.current;
      await resetDemo();
      setRun(null);
      setError(null);
      setCaptureFailed(false);
      setSeconds(0);
      setEvidenceId(null);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function startMeter(media: MediaStream) {
    if (typeof AudioContext === "undefined") return;
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 64;
    context.createMediaStreamSource(media).connect(analyser);
    audioContextRef.current = context;
    const bins = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      analyser.getByteFrequencyData(bins);
      setMeter(Array.from({ length: 24 }, (_, index) => Math.max(0.06, (bins[index] ?? 0) / 255)));
      meterFrameRef.current = window.requestAnimationFrame(draw);
    };
    draw();
  }

  function stopMeter() {
    if (meterFrameRef.current !== null) window.cancelAnimationFrame(meterFrameRef.current);
    meterFrameRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setMeter(Array.from({ length: 24 }, () => 0.08));
  }

  function cleanupMedia() {
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      if (recorder.state !== "inactive") recorder.stop();
    }
    recorderRef.current = null;
    mediaRef.current?.getTracks().forEach((track) => track.stop());
    mediaRef.current = null;
    stopMeter();
  }

  if (!run) {
    return <Launch onLive={startLive} onRecorded={startRecorded} busy={busy} error={error} />;
  }

  const events = run.events ?? [];
  const transcript = events
    .filter((event) => event.source === "speech" && event.observation === "utterance")
    .sort((a, b) => a.ts - b.ts);
  const facts = events.filter((event) => event.source === "speech" && event.observation !== "utterance");
  const vitals = events.filter((event) => event.source === "vital");
  const notification = events.find((event) => event.observation === "notification_created");
  const actionEvent = events.find((event) => event.value === "approved" || event.value === "rejected");
  const memoryUpdated = run.activities.some((item) => item.type === "patient_history.updated");
  const priorityChanged = run.activities.some((item) => item.type === "priority.changed");
  const stage = actionEvent ? 4 : notification ? 4 : priorityChanged ? 3 : run.monitorStep ? 2 : memoryUpdated ? 1 : 0;
  const selectedEvidence = evidenceId ? evidence.get(evidenceId) ?? null : null;

  return (
    <main className="min-h-screen bg-[#edf1ef] text-ink">
      <header className="sticky top-0 z-40 border-b border-[#173b35] bg-white/95 backdrop-blur-xl">
        <div className="flex min-h-16 items-center px-5 py-2 md:px-8">
          <a href="/ward/" className="text-[16px] font-semibold uppercase tracking-[.24em]">ECHO</a>
          <div className="ml-5 border-l border-line pl-5">
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[var(--accent)]">Live clinical pipeline</p>
            <p className="mt-0.5 text-[11px] text-dim">
              {run.patient?.displayId ?? "P-014"} · {run.patient?.name ?? "Elena Petrova"} · Room 02
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <TruthBadge run={run} captureFailed={captureFailed} />
            <button onClick={() => setInspector(true)} className="hidden items-center gap-2 border-l border-line pl-4 text-[10px] font-semibold text-dim hover:text-ink sm:flex">
              <Activity size={14} />System activity
            </button>
            <button disabled={busy} onClick={() => void reset()} className="p-2 text-faint hover:text-ink disabled:opacity-40" title="Reset demo">
              <RotateCcw size={15} />
            </button>
          </div>
        </div>
        <StageRail active={stage} />
      </header>

      <div className="mx-auto grid max-w-[1540px] xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="border-r border-line bg-white">
          <Encounter
            run={run}
            transcript={transcript}
            seconds={seconds}
            meter={meter}
            busy={busy}
            captureFailed={captureFailed}
            onStop={stopLive}
            onFallback={startRecorded}
          />
          <FlowConnector
            active={memoryUpdated}
            label={memoryUpdated ? "Structured facts persisted; patient memory projection updated" : "Awaiting a persisted history update"}
          />
          <Memory facts={facts} run={run} memoryUpdated={memoryUpdated} />
          <FlowConnector
            active={run.monitorStep > 0}
            label={run.monitorStep ? "Device readings entered the same append-only run" : "Conversation retained; no dramatic alert from one sentence"}
          />
          <Monitor run={run} vitals={vitals} busy={busy} captureFailed={captureFailed} onAdvance={advanceMonitor} />
          <FlowConnector
            active={priorityChanged}
            label={priorityChanged ? "Trend recalculated; a real priority transition event exists" : "Trajectory is still below the next deterministic gate"}
          />
          <Correlation run={run} facts={facts} onEvidence={setEvidenceId} />
          {notification && <Notification event={notification} run={run} onEvidence={setEvidenceId} />}
          <RunAssistant run={run} transcript={transcript} facts={facts} onEvidence={setEvidenceId} />
          {run.proposals?.[0] && (
            <div className="border-t border-line p-6 md:p-9">
              <RecommendedAction
                proposal={run.proposals[0]}
                until={run.projectionUntil}
                decideAction={(input) => decideDemoRun(run.runId, input)}
                onDecided={() => void refresh()}
              />
            </div>
          )}
        </div>
        <Context run={run} transcript={transcript} facts={facts} />
      </div>

      {error && (
        <div role="alert" className="fixed bottom-5 left-1/2 z-50 flex w-[min(92vw,680px)] -translate-x-1/2 items-start gap-3 border border-[var(--lvl-high)] bg-white px-4 py-3 text-[11px] shadow-2xl">
          <AlertTriangle className="mt-0.5 shrink-0 text-[var(--lvl-high)]" size={14} />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss error"><X size={13} /></button>
        </div>
      )}
      {inspector && <Inspector activities={run.activities} runId={run.runId} onClose={() => setInspector(false)} />}
      {selectedEvidence && <EvidenceDrawer event={selectedEvidence} evidence={evidence} onSelect={setEvidenceId} onClose={() => setEvidenceId(null)} />}
    </main>
  );
}

function Launch({
  onLive,
  onRecorded,
  busy,
  error,
}: {
  onLive: () => void;
  onRecorded: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#e9efec] p-5">
      <div className="w-full max-w-5xl overflow-hidden border border-[#aebeb8] bg-white shadow-[0_35px_100px_rgba(20,49,41,.14)]">
        <div className="grid md:grid-cols-[1.2fr_.8fr]">
          <section className="p-8 md:p-12">
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[var(--accent)]">ECHO · Live clinical pipeline</p>
            <h1 className="mt-5 max-w-xl text-[clamp(34px,5vw,62px)] font-medium leading-[.98] tracking-[-.055em]">
              Don&rsquo;t watch a dashboard.<br /><span className="text-[#547169]">Watch what happens.</span>
            </h1>
            <p className="mt-6 max-w-lg text-[14px] leading-relaxed text-dim">
              Speak with one patient. Corti captures the encounter. ECHO remembers it, waits for sustained evidence, then exposes the exact event that changed attention.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <button disabled={busy} onClick={onLive} className="flex items-center gap-3 bg-[#143b34] px-5 py-3.5 text-[11px] font-semibold text-white shadow-lg transition hover:-translate-y-px disabled:opacity-50">
                <Mic size={15} />Start live encounter
              </button>
              <button disabled={busy} onClick={onRecorded} className="flex items-center gap-3 border border-[#9eafa8] px-5 py-3.5 text-[11px] font-semibold text-ink transition hover:bg-sunk disabled:opacity-50">
                <Play size={14} />Use recorded fallback
              </button>
            </div>
            {error && <p className="mt-4 text-[11px] text-[var(--lvl-high)]">{error}</p>}
            <p className="mt-7 max-w-lg text-[10px] leading-relaxed text-faint">
              Live mode uses the browser microphone and configured Corti Streams credentials. The fallback is a clearly labeled synthetic result; it never claims a live API call.
            </p>
          </section>
          <aside className="border-l border-line bg-[#143b34] p-8 text-white md:p-10">
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#8fc5b6]">Five-minute story</p>
            <div className="mt-8 space-y-6">
              {["Live conversation", "Corti transcript + facts", "Patient memory changes", "Monitor trend persists", "Priority → notification → action"].map((text, index) => (
                <div key={text} className="flex items-center gap-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-[10px] tabular">0{index + 1}</span>
                  <span className="text-[12px] text-white/80">{text}</span>
                </div>
              ))}
            </div>
            <blockquote className="mt-10 border-t border-white/15 pt-6 text-[17px] leading-snug">
              “Most systems remember events.<br />ECHO remembers trajectories.”
            </blockquote>
          </aside>
        </div>
      </div>
    </main>
  );
}

function TruthBadge({ run, captureFailed }: { run: DemoRunSnapshot; captureFailed: boolean }) {
  let label = "Recorded synthetic fallback";
  let tone = "bg-[#f4efe6] text-[#7b633a]";
  let pulse = false;
  if (run.mode === "live") {
    if (captureFailed || run.status === "failed") {
      label = "Live Corti failed";
      tone = "bg-[#f8e9e5] text-[var(--lvl-high)]";
    } else if (run.status === "connecting") {
      label = "Connecting to Corti";
      tone = "bg-[#eef1ef] text-dim";
    } else if (run.status === "recording") {
      label = "Live with Corti";
      tone = "bg-[#e8f3ef] text-[#225f50]";
      pulse = true;
    } else if (run.status === "processing") {
      label = "Corti finalizing";
      tone = "bg-[#e8f3ef] text-[#225f50]";
    } else if (run.status === "ended") {
      label = "Live Corti encounter complete";
      tone = "bg-[#e8f3ef] text-[#225f50]";
    }
  } else if (run.status === "failed") {
    label = "Recorded replay failed";
    tone = "bg-[#f8e9e5] text-[var(--lvl-high)]";
  }
  return (
    <span className={`flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-[.11em] ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${pulse ? "live-pulse bg-[#2f8069]" : "bg-current opacity-60"}`} />
      {label}
    </span>
  );
}

function StageRail({ active }: { active: number }) {
  return (
    <div className="flex h-10 items-center border-t border-line px-5 md:px-8">
      {STAGES.map((label, index) => (
        <div key={label} className="flex flex-1 items-center">
          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] ${index < active ? "bg-[var(--accent)] text-white" : index === active ? "border border-[var(--accent)] bg-white text-[var(--accent)]" : "border border-line text-faint"}`}>
            {index < active ? <Check size={10} /> : index + 1}
          </span>
          <span className={`ml-2 hidden text-[10px] font-semibold uppercase tracking-wide sm:block ${index <= active ? "text-ink" : "text-faint"}`}>{label}</span>
          {index < STAGES.length - 1 && <span className={`mx-3 h-px flex-1 ${index < active ? "bg-[var(--accent)]" : "bg-line"}`} />}
        </div>
      ))}
    </div>
  );
}

function Encounter({
  run,
  transcript,
  seconds,
  meter,
  busy,
  captureFailed,
  onStop,
  onFallback,
}: {
  run: DemoRunSnapshot;
  transcript: EchoEvent[];
  seconds: number;
  meter: number[];
  busy: boolean;
  captureFailed: boolean;
  onStop: () => void;
  onFallback: () => void;
}) {
  const isLive = run.mode === "live";
  const recording = isLive && run.status === "recording" && !captureFailed;
  const failed = isLive && (run.status === "failed" || captureFailed);
  const title = failed ? "Live capture interrupted" : recording ? "Corti is listening" : run.status === "processing" ? "Corti is finalizing" : isLive ? "Live encounter captured" : "Recorded encounter fallback";
  // Two labels, deliberately separate: the diarization SLOT is Corti's, the
  // clinical ROLE is ECHO's. Collapsing them would hide which system decided.
  const rows = isLive && run.transcriptSegments.length
    ? run.transcriptSegments.map((segment) => ({
        id: segment.eventId,
        label: roleLabel(segment.speaker),
        speaker: segment.speaker,
        text: segment.text,
        code: segment.code,
        meta: segment.speakerId >= 0
          ? `Corti speaker ${segment.speakerId + 1} · ${segment.startSeconds.toFixed(1)}s`
          : `Slot unresolved · ${segment.startSeconds.toFixed(1)}s`,
      }))
    : transcript.map((event) => ({
        id: event.id,
        label: roleLabel(event.speaker),
        speaker: event.speaker,
        text: event.quote,
        code: event.code ?? null,
        meta: `${isLive ? "Final Corti segment" : "Recorded fixture"} · ${event.id}`,
      }));

  return (
    <section className="p-6 md:p-9">
      <SectionHead
        number="01"
        eyebrow="Conversation"
        title={title}
        source={isLive ? "LIVE MICROPHONE INPUT → CORTI STREAMS" : "RECORDED SYNTHETIC FALLBACK · NO LIVE CORTI CALL"}
        icon={<AudioLines size={18} />}
      />
      <div className="mt-6 grid gap-6 lg:grid-cols-[190px_1fr]">
        <div className="border-r border-line pr-6">
          <div className={`flex h-28 items-center justify-center ${isLive ? "bg-[#e9f2ef]" : "bg-[#f5f1e9]"}`}>
            <Wave levels={meter} active={recording} />
          </div>
          {recording && (
            <>
              <p className="mt-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-[var(--lvl-high)]">
                <span className="live-pulse h-2 w-2 rounded-full bg-[var(--lvl-high)]" />Recording · {formatDuration(seconds)}
              </p>
              <p className="mt-1 text-[9px] text-faint">Waveform uses the live microphone level.</p>
              <button disabled={busy} onClick={onStop} className="mt-3 flex w-full items-center justify-center gap-2 border border-line py-2.5 text-[10px] font-semibold hover:bg-sunk disabled:opacity-40">
                <CircleStop size={13} />End encounter
              </button>
            </>
          )}
          {run.status === "processing" && <p className="mt-3 text-[10px] font-semibold text-[var(--accent)]">Remaining audio is being finalized by Corti.</p>}
          {failed && (
            <button disabled={busy} onClick={onFallback} className="mt-3 flex w-full items-center justify-center gap-2 bg-[#143b34] px-3 py-2.5 text-[10px] font-semibold text-white disabled:opacity-40">
              <Play size={12} />Use labeled fallback
            </button>
          )}
        </div>
        <div className="min-h-[180px]" aria-live="polite">
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-faint">Finalized transcript</p>
          {isLive && <AttributionBanner attribution={run.attribution} />}
          <div className="mt-3 space-y-4">
            {rows.length ? rows.slice(-7).map((row) => (
              <div key={row.id} className="transcript-enter grid grid-cols-[112px_1fr] gap-3">
                <span
                  className={`pt-0.5 text-[10px] font-bold uppercase tracking-wide ${roleTone(row.speaker)}`}
                >
                  {row.label}
                </span>
                <div>
                  <p className="text-[14px] leading-relaxed">{row.text}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="text-[9px] uppercase tracking-wide text-faint">{row.meta}</p>
                    {row.code && (
                      <span
                        className="code-badge rounded-sm border border-[#4b8b79]/50 bg-[#4b8b79]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--accent)]"
                        title="Medical code returned by Corti /v2/tools/coding/"
                      >
                        Corti code · {row.code}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )) : (
              <p className="py-8 text-[12px] text-faint">
                {recording ? "Final Corti segments will appear as they are produced." : run.status === "processing" ? "Waiting for final Corti output…" : "No transcript event has been persisted."}
              </p>
            )}
            {run.partialTranscript && (
              <p className="border-l border-line pl-3 text-[11px] italic text-faint">Interim transport message: {run.partialTranscript}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Memory({ facts, run, memoryUpdated }: { facts: EchoEvent[]; run: DemoRunSnapshot; memoryUpdated: boolean }) {
  return (
    <section className="p-6 md:p-9" aria-live="polite">
      <SectionHead
        number="02"
        eyebrow="Raw → structured"
        title={memoryUpdated ? "Patient memory changed" : "Awaiting structured facts"}
        source={run.mode === "live" ? "CORTI FACTS → ECHO EVENT LOG" : "RECORDED SYNTHETIC FACT → ECHO EVENT LOG"}
        icon={<FileClock size={18} />}
      />
      <ExtractionPulse run={run} factCount={facts.length} />
      <div className="mt-6 grid gap-5 md:grid-cols-[1fr_auto_1fr]">
        <div className="border-l border-line pl-4">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-faint">Before encounter</p>
          <p className="mt-4 text-[12px] text-dim">Longitudinal chart baseline</p>
          <p className="mt-2 text-[11px] text-faint">No fact linked to this run</p>
        </div>
        <ChevronRight className="self-center text-[#87a299]" size={18} />
        <div className="border-l border-[#4b8b79] pl-4">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[var(--accent)]">After encounter</p>
          <div className="mt-3 space-y-3">
            {facts.length ? facts.slice(-5).map((fact) => (
              <details key={fact.id} className="fact-enter group">
                <summary className="cursor-pointer list-none">
                  <div className="flex items-start gap-3">
                    <span className="mt-1 h-2 w-2 rounded-full bg-[#4b8b79]" />
                    <div>
                      <p className="text-[12px] font-semibold capitalize">{fact.observation.replace(/_/g, " ")}</p>
                      <p className="mt-1 text-[11px] text-dim">{fact.value === null ? fact.quote : String(fact.value)}</p>
                      <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-[var(--accent)]">
                        New · {fact.causedByEventIds?.length ? "direct parent attached" : "run provenance attached"}
                      </p>
                    </div>
                  </div>
                </summary>
                <div className="ml-5 mt-2 border-l border-line pl-3 text-[10px] leading-relaxed text-faint">
                  Event {fact.id}<br />
                  {fact.causedByEventIds?.length
                    ? `Caused by ${fact.causedByEventIds.join(", ")}`
                    : `Correlated by ${run.runId}; Corti did not return a segment-level evidence id.`}
                </div>
              </details>
            )) : <p className="text-[11px] text-faint">No clinical fact persisted yet.</p>}
          </div>
        </div>
      </div>
      {memoryUpdated && (
        <p className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-[11px] font-semibold text-[#2f6f5f]">
          <ShieldCheck size={14} />Patient history updated from this encounter · run {run.runId}
        </p>
      )}
    </section>
  );
}

function Monitor({
  run,
  vitals,
  busy,
  captureFailed,
  onAdvance,
}: {
  run: DemoRunSnapshot;
  vitals: EchoEvent[];
  busy: boolean;
  captureFailed: boolean;
  onAdvance: () => void;
}) {
  const steps = groupVitals(vitals);
  const ready = run.mode === "recorded" ? run.status === "ready" : run.status === "ended";
  return (
    <section className="p-6 md:p-9">
      <SectionHead number="03" eyebrow="Time + monitor" title="Let the trajectory develop" source="SIMULATED DEVICE INPUT → REAL EVENT APPEND" icon={<MonitorUp size={18} />} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_220px]">
        <div>
          <div className="grid grid-cols-2 border-y border-line lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => {
              const point = steps[index];
              return (
                <div key={index} className={`relative min-h-[210px] border-r border-line px-4 py-4 transition-all ${point ? "monitor-enter bg-[#f1f6f4]" : "bg-white text-faint"}`}>
                  <p className="text-[9px] font-bold uppercase tracking-wide">{point ? clinicalOffset(run.startedAt, point.ts) : `Reading ${index + 1}`}</p>
                  {point ? (
                    <>
                      <p className="mt-4 text-[23px] font-semibold tabular">{point.spo2}<span className="text-[10px] text-faint">%</span></p>
                      <p className="text-[10px] text-dim">SpO₂</p>
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <TinyVital label="HR" value={point.heart_rate} />
                        <TinyVital label="RR" value={point.respiratory_rate} />
                        <TinyVital label="SBP" value={point.systolic_bp} />
                      </div>
                      <p className="mt-4 text-[9px] leading-relaxed text-faint">HR is displayed but the engine will cite it only if it worsens from Elena&rsquo;s chart baseline.</p>
                      <Check className="absolute right-3 top-3 text-[var(--accent)]" size={12} />
                    </>
                  ) : <p className="mt-14 text-[11px]">Awaiting event append</p>}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-faint">
            Synthetic bedside readings are accelerated to cross the reviewed 1h, 2h and 4h persistence gates. Event ingestion, trend projection, priority and ranking are the production folds.
          </p>
        </div>
        <div>
          <button disabled={busy || run.monitorStep >= 4 || !ready || captureFailed} onClick={onAdvance} className="flex w-full items-center justify-center gap-2 bg-[#173b35] px-4 py-3 text-[10px] font-semibold text-white transition hover:-translate-y-px disabled:opacity-35">
            <HeartPulse size={14} />{run.monitorStep ? "Advance monitor" : "Start device stream"}
          </button>
          {!ready && !captureFailed && run.mode === "live" && <p className="mt-2 text-[9px] leading-relaxed text-faint">End the Corti encounter and wait for ENDED before introducing device data.</p>}
          <div className="mt-4 border-l border-line pl-3">
            <p className="text-[9px] font-bold uppercase tracking-wide text-faint">Confirmed appends</p>
            <p className="mt-1 text-[23px] font-semibold tabular">{vitals.length}</p>
            <p className="text-[10px] text-dim">vital events in this run</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Correlation({ run, facts, onEvidence }: { run: DemoRunSnapshot; facts: EchoEvent[]; onEvidence: (id: string) => void }) {
  const priority = run.priority;
  const cited = new Set(priority?.evidenceEventIds ?? []);
  const signals = (run.trends?.signals ?? []).filter((signal) => signal.concerning && signal.evidenceEventIds.some((id) => cited.has(id)));
  const high = priority?.level === "HIGH" || priority?.level === "CRITICAL";
  const priorityEvent = (run.events ?? []).find((event) => event.observation === "priority_changed" && event.value === priority?.level);
  const path = run.activities.filter((item) => item.type === "priority.changed");
  const factCited = facts.some((fact) => fact.causedByEventIds?.some((id) => cited.has(id)) || cited.has(fact.id));

  return (
    <section className={`p-6 transition-colors duration-700 md:p-9 ${high ? "bg-[#143b34] text-white" : "bg-[#f6f7f6]"}`} aria-live="polite">
      <SectionHead number="04" eyebrow="Correlation" title={high ? "ECHO connected the causal signals" : "Evidence is still accumulating"} source="ECHO DETERMINISTIC TREND + PRIORITY ENGINE" icon={<Sparkles size={18} />} inverse={high} />

      <div className="mt-7 grid gap-3 md:grid-cols-3">
        {signals.length ? signals.map((signal) => (
          <SignalReceipt key={signal.observation} signal={signal} inverse={high} onEvidence={onEvidence} />
        )) : (
          <div className={`border p-4 md:col-span-3 ${high ? "border-white/15" : "border-line"}`}>
            <p className="text-[11px] text-dim">No engine-cited concerning trend is present yet.</p>
          </div>
        )}
      </div>

      <div className={`mt-4 border p-4 ${high ? "border-white/15 bg-white/5" : "border-line bg-white"}`}>
        <p className={`text-[9px] font-bold uppercase tracking-[.14em] ${high ? "text-[#8fc5b6]" : "text-[var(--accent)]"}`}>Conversation context</p>
        <p className={`mt-2 text-[12px] leading-relaxed ${high ? "text-white/75" : "text-dim"}`}>
          {facts.at(-1)?.value ? String(facts.at(-1)?.value) : "No structured conversation fact is available."}
        </p>
        <p className={`mt-2 text-[10px] ${high ? "text-white/45" : "text-faint"}`}>
          {factCited ? "This fact is directly cited by the current decision." : "Retained in patient memory as clinical context. This priority transition rests on the numeric evidence shown above; ECHO does not pretend Corti returned segment-level causality."}
        </p>
      </div>

      <div className={`mt-7 grid gap-5 border-t pt-5 lg:grid-cols-[1fr_auto] ${high ? "border-white/15" : "border-line"}`}>
        <div>
          <p className={`text-[9px] font-bold uppercase tracking-[.16em] ${high ? "text-[#8fc5b6]" : "text-faint"}`}>{high ? "Why now?" : "Why not earlier?"}</p>
          <p className={`mt-2 text-[12px] leading-relaxed ${high ? "text-white/75" : "text-dim"}`}>
            {high
              ? priority?.reasons.find((reason) => reason.includes("distinct signals")) ?? priority?.reasons[0]
              : priority?.withheld[0] ?? "The next gate still lacks the required agreement, samples or persistence."}
          </p>
          {path.length > 0 && <p className={`mt-3 text-[10px] ${high ? "text-white/45" : "text-faint"}`}>Observed path: {path.map((item) => item.label.split(" · ")[0]).join(" → ")}</p>}
          {priorityEvent && (
            <button onClick={() => onEvidence(priorityEvent.id)} className={`mt-3 border-b text-[10px] font-semibold ${high ? "border-white/30 text-white" : "border-[#8ba49c] text-[var(--accent)]"}`}>
              Open persisted priority event {priorityEvent.id}
            </button>
          )}
        </div>
        {priority && (
          <div className="flex items-center gap-5 self-end">
            <LevelBadge level={priority.level} />
            <div className="text-right">
              <p className={`text-[9px] uppercase ${high ? "text-white/45" : "text-faint"}`}>Ward rank</p>
              <p className="text-[26px] font-semibold tabular">#{priority.rank}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Notification({ event, run, onEvidence }: { event: EchoEvent; run: DemoRunSnapshot; onEvidence: (id: string) => void }) {
  return (
    <section className="notification-arrive border-t border-[#d7b3aa] bg-[#fff9f7] p-6 md:p-9" aria-live="assertive">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f3ded8] text-[var(--lvl-high)]"><Bell size={18} /></span>
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[var(--lvl-high)]">In-app nurse notification created</p>
          <h3 className="mt-2 text-[20px] font-medium">{run.patient?.displayId ?? "P-014"} requires reassessment</h3>
          <p className="mt-2 text-[12px] leading-relaxed text-dim">{event.quote}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {event.causedByEventIds?.map((id) => (
              <button key={id} onClick={() => onEvidence(id)} className="border-b border-[#c58f82] text-[10px] text-[var(--lvl-high)]">Caused by {id}</button>
            ))}
          </div>
        </div>
        <span className="text-[9px] font-bold uppercase tracking-wide text-faint">ECHO IN-APP · not SMS</span>
      </div>
    </section>
  );
}

function RunAssistant({
  run,
  transcript,
  facts,
  onEvidence,
}: {
  run: DemoRunSnapshot;
  transcript: EchoEvent[];
  facts: EchoEvent[];
  onEvidence: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<RunAnswer | null>(null);
  const prompts = ["What changed this encounter?", "Why now?", "What did the patient say?", "Prepare handoff"];

  function ask(question: string) {
    if (!question.trim()) return;
    setAnswer(answerRunQuestion(question, run, transcript, facts));
    setQuery("");
  }

  return (
    <section className="run-assistant border-t border-line p-6 md:p-9">
      <div className="overflow-hidden border border-[#b9cbc5] bg-white shadow-[0_18px_55px_rgba(25,50,43,.08)]">
        <header className="flex items-center justify-between border-b border-[#183e37] bg-[#143a33] px-5 py-4 text-white">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-white/50">Ask ECHO about this run</p>
            <p className="mt-1 text-[13px] font-medium">Deterministic patient context · {run.events?.length ?? 0} run events</p>
          </div>
          <span className="text-[9px] uppercase tracking-wide text-white/50">No generated clinical truth</span>
        </header>
        <div className="p-5">
          <div className="flex flex-wrap gap-2">
            {prompts.map((prompt) => <button key={prompt} onClick={() => ask(prompt)} className="rounded-full border border-line bg-[#f7f8f7] px-3 py-1.5 text-[10px] font-medium text-dim hover:border-[#78978d] hover:bg-white hover:text-ink">{prompt}</button>)}
          </div>
          <div className="mt-4 min-h-[110px] border-l border-[#9db7ae] pl-5" aria-live="polite">
            {answer ? (
              <div className="assistant-answer">
                <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--accent)]">ECHO response</p>
                <p className="mt-2 text-[14px] font-medium leading-relaxed">{answer.headline}</p>
                {answer.lines.map((line) => <p key={line} className="mt-1.5 text-[11px] leading-relaxed text-dim">{line}</p>)}
                <div className="mt-4 flex flex-wrap gap-2">
                  {answer.evidenceIds.slice(0, 6).map((id) => (
                    <button key={id} onClick={() => onEvidence(id)} className="flex items-center gap-1.5 border-b border-[#9db7ae] pb-0.5 text-[9px] font-medium text-[var(--accent)]"><FileCheck2 size={11} />{id}</button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-4">
                <p className="text-[14px] font-medium">The information captured in this run is queryable now.</p>
                <p className="mt-1 text-[11px] leading-relaxed text-dim">Answers are assembled directly from the run snapshot and cite event IDs.</p>
              </div>
            )}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); ask(query); }} className="mt-4 flex items-center border-t border-line pt-4">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="When did oxygen saturation start falling?" className="min-w-0 flex-1 bg-transparent py-2 text-[12px] outline-none placeholder:text-faint" />
            <button disabled={!query.trim()} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#173b35] text-white disabled:opacity-30" aria-label="Ask ECHO"><Send size={14} /></button>
          </form>
        </div>
      </div>
    </section>
  );
}

function Context({ run, transcript, facts }: { run: DemoRunSnapshot; transcript: EchoEvent[]; facts: EchoEvent[] }) {
  const lastPriority = [...run.activities].reverse().find((item) => item.type === "priority.changed");
  const queue = (run.queue ?? []).slice(0, 4);
  return (
    <aside className="sticky top-[106px] h-[calc(100vh-106px)] overflow-y-auto bg-[#f8f9f8] p-6">
      <p className="text-[10px] font-bold uppercase tracking-[.16em] text-faint">One patient · one causal run</p>
      <h2 className="mt-2 text-[23px] font-medium">{run.patient?.name ?? "Elena Petrova"}</h2>
      <p className="mt-1 text-[10px] text-dim">{run.patient?.displayId ?? "P-014"} · Synthetic hero identity · Room 02</p>

      <div className="mt-6 border-y border-ink py-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wide text-faint">Current priority</p>
            {run.priority ? <div className="mt-2"><LevelBadge level={run.priority.level} /></div> : <p className="mt-2 text-[12px]">Stable baseline</p>}
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase text-faint">Ward rank</p>
            <p className="mt-1 text-[28px] font-semibold tabular">#{run.priority?.rank ?? "—"}</p>
          </div>
        </div>
        {run.priority && run.initialRank !== run.priority.rank && <p className="queue-rise mt-3 border-t border-line pt-3 text-[10px] font-semibold text-[var(--accent)]">Actual movement · #{run.initialRank} → #{run.priority.rank}</p>}
        {lastPriority && <p className="mt-2 text-[10px] text-dim">{lastPriority.label}</p>}
      </div>

      <div className="mt-5">
        <p className="text-[9px] font-bold uppercase tracking-[.14em] text-faint">Attention queue · live fold</p>
        <ol className="mt-3 space-y-1">
          {queue.map((row) => (
            <li key={row.patientId} className={`flex items-center gap-3 border px-3 py-2.5 transition-all ${row.patientId === run.patientId ? "queue-rise border-[#73978c] bg-white" : "border-transparent"}`}>
              <span className="w-6 text-[12px] font-semibold tabular">#{row.rank}</span>
              <span className="min-w-0 flex-1 truncate text-[10px] font-medium">{row.name}</span>
              <span className="text-[9px] uppercase text-faint">{row.level.replace(/_/g, " ")}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-6 space-y-4">
        <Metric label="Run ID" value={run.runId} />
        <Metric label="Corti interaction" value={run.interactionId ?? (run.mode === "recorded" ? "No live interaction" : "Not connected")} />
        <Metric label="Transcript events" value={String(transcript.length)} />
        <Metric label="Clinical fact events" value={String(facts.length)} />
        <Metric label="Monitor step" value={`${run.monitorStep} / 4`} />
      </div>
      <button onClick={() => document.querySelector<HTMLElement>(".run-assistant")?.scrollIntoView({ behavior: "smooth" })} className="mt-7 flex w-full items-center justify-between border border-line bg-white px-4 py-3 text-[10px] font-semibold text-[var(--accent)]">
        Ask about this run <ChevronRight size={13} />
      </button>
      <a href={`/patients/${run.patientId}/`} className="mt-2 flex w-full items-center justify-between border border-line bg-white px-4 py-3 text-[10px] font-semibold text-ink">
        Open baseline patient record <ChevronRight size={13} />
      </a>
      <p className="mt-7 text-[10px] leading-relaxed text-faint">Every clinical state on this page comes from one atomic run snapshot. Final transcript, facts, vitals, priority transitions, notifications and human decisions are persisted events.</p>
    </aside>
  );
}

function Inspector({ activities, runId, onClose }: { activities: DemoActivity[]; runId: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[2px]" onClick={onClose}>
      <aside className="ml-auto h-full w-full max-w-lg overflow-y-auto bg-[#102d27] p-6 text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-white/15 pb-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#84b8aa]">System activity</p>
            <h2 className="mt-2 text-[21px] font-medium">Causal event inspector</h2>
            <p className="mt-1 text-[10px] text-white/45">Run {runId} · source and parents preserved</p>
          </div>
          <button onClick={onClose} className="p-2 text-white/60 hover:text-white" aria-label="Close system activity"><X size={16} /></button>
        </div>
        <ol className="mt-6">
          {activities.map((item, index) => (
            <li key={item.id} className="grid grid-cols-[62px_18px_1fr] gap-3">
              <time className="pt-0.5 text-[9px] tabular text-white/35">{new Date(item.at).toISOString().slice(11, 19)}</time>
              <div className="flex flex-col items-center">
                <span className="mt-1 h-2 w-2 rounded-full bg-[#75b5a4]" />
                {index < activities.length - 1 && <span className="min-h-12 w-px flex-1 bg-white/15" />}
              </div>
              <div className="pb-5">
                <p className="text-[9px] font-bold uppercase tracking-[.14em] text-[#84b8aa]">{item.source}</p>
                <p className="mt-1 text-[11px] font-medium">{item.type}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-white/55">{item.label}{item.detail ? ` · ${item.detail}` : ""}</p>
                {item.eventIds.length > 0 && <p className="mt-1 text-[9px] text-white/35">created {item.eventIds.join(", ")}</p>}
                {item.causedByEventIds.length > 0 && <p className="mt-1 text-[9px] text-white/30">caused by {item.causedByEventIds.join(", ")}</p>}
              </div>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

function EvidenceDrawer({
  event,
  evidence,
  onSelect,
  onClose,
}: {
  event: EchoEvent;
  evidence: Map<string, EchoEvent>;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/20" onClick={onClose}>
      <aside className="absolute bottom-0 right-0 top-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl" onClick={(click) => click.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-line pb-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[var(--accent)]">Evidence event</p>
            <h2 className="mt-2 text-[20px] font-medium">{event.id}</h2>
          </div>
          <button onClick={onClose} aria-label="Close evidence"><X size={16} /></button>
        </div>
        <dl className="mt-6 grid grid-cols-[110px_1fr] gap-y-4 text-[11px]">
          <dt className="text-faint">Source boundary</dt><dd className="font-semibold uppercase">{event.source}</dd>
          <dt className="text-faint">Observation</dt><dd>{event.observation.replace(/_/g, " ")}</dd>
          <dt className="text-faint">Value</dt><dd>{event.value === null ? "—" : String(event.value)}</dd>
          <dt className="text-faint">Timestamp</dt><dd className="tabular">{new Date(event.ts).toISOString()}</dd>
          <dt className="text-faint">Run</dt><dd>{event.correlationId ?? "Historical baseline"}</dd>
        </dl>
        {event.quote && <blockquote className="mt-6 border-l-2 border-[#8eaaa1] pl-4 text-[13px] leading-relaxed">“{event.quote}”</blockquote>}
        <div className="mt-7 border-t border-line pt-5">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-faint">Direct parents</p>
          {event.causedByEventIds?.length ? (
            <div className="mt-3 space-y-2">
              {event.causedByEventIds.map((id) => (
                <button key={id} disabled={!evidence.has(id)} onClick={() => onSelect(id)} className="flex w-full items-center justify-between border border-line px-3 py-2 text-left text-[10px] disabled:opacity-40">
                  {id}<ChevronRight size={12} />
                </button>
              ))}
            </div>
          ) : <p className="mt-2 text-[11px] text-faint">This event entered independently or the upstream system returned no segment-level parent.</p>}
        </div>
      </aside>
    </div>
  );
}

function SectionHead({ number, eyebrow, title, source, icon, inverse }: { number: string; eyebrow: string; title: string; source: string; icon: React.ReactNode; inverse?: boolean }) {
  return (
    <div className="flex items-start gap-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular ${inverse ? "border-white/20 text-white/70" : "border-line text-faint"}`}>{number}</span>
      <div>
        <p className={`text-[10px] font-bold uppercase tracking-[.17em] ${inverse ? "text-[#8fc5b6]" : "text-[var(--accent)]"}`}>{eyebrow}</p>
        <h2 className="mt-1 text-[22px] font-medium tracking-tight">{title}</h2>
        <p className={`mt-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[.12em] ${inverse ? "text-white/40" : "text-faint"}`}>{icon}{source}</p>
      </div>
    </div>
  );
}

/**
 * Corti is working and nothing has come back yet.
 *
 * Deliberately not a progress bar: nothing here knows how much audio is left
 * to process, and a bar that invents a percentage would be the one dishonest
 * pixel on the screen. A travelling sheen says "working" and claims nothing.
 */
function ExtractionPulse({ run, factCount }: { run: DemoRunSnapshot; factCount: number }) {
  const working = run.status === "recording" || run.status === "processing";
  if (!working) return null;

  const label = run.status === "processing"
    ? "Corti is finalizing the encounter"
    : factCount === 0
      ? "Corti is listening for clinical facts"
      : "Corti is extracting further facts";

  return (
    <div className="mt-5" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="flex h-4 items-end gap-[3px]" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((bar) => (
            <span
              key={bar}
              className="waveform-bar w-[3px] rounded-sm bg-[var(--accent)]"
              style={{ height: "100%", animationDelay: `${bar * 0.12}s` }}
            />
          ))}
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">{label}</p>
        {factCount > 0 && (
          <span className="text-[10px] uppercase tracking-wide text-faint">
            {factCount} fact{factCount === 1 ? "" : "s"} so far
          </span>
        )}
      </div>
      <div className="extracting mt-2 h-[2px] w-full rounded-full" aria-hidden="true" />
    </div>
  );
}

/** Role name for a speaker. 'unknown' is stated as a refusal, not hidden. */
function roleLabel(speaker: string): string {
  if (speaker === "clinician" || speaker === "nurse") return "Clinician";
  if (speaker === "patient") return "Patient";
  if (speaker === "family") return "Family";
  return "Role pending";
}

/** Clinician and patient must be separable at a glance from the back of a room. */
function roleTone(speaker: string): string {
  if (speaker === "clinician" || speaker === "nurse") return "text-[#7fb4ff]";
  if (speaker === "patient") return "text-[var(--accent)]";
  return "text-faint";
}

/**
 * What diarization decided, and on what evidence.
 *
 * Shown even when it decided nothing: a refusal to attribute is the honest
 * outcome of a one-speaker recording, and hiding it would let the demo imply
 * an attribution the system never made.
 */
function AttributionBanner({ attribution }: { attribution: DemoAttribution | null }) {
  if (!attribution) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded border border-line bg-[var(--sunk)]/40 px-3 py-2">
        <span className="listening-dot h-1.5 w-1.5 rounded-full bg-faint" />
        <p className="text-[10px] uppercase tracking-wide text-faint">Listening for a second speaker…</p>
      </div>
    );
  }

  const tone = attribution.resolved ? "border-[#4b8b79]/50 bg-[#4b8b79]/10" : "border-line bg-[var(--sunk)]/40";

  return (
    <div className={`attribution-enter mt-3 rounded border px-3 py-2 ${tone}`} aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-[10px] font-bold uppercase tracking-wide ${attribution.resolved ? "text-[var(--accent)]" : "text-faint"}`}>
          {attribution.resolved ? "Speakers separated" : "Roles not assigned"}
        </span>
        <span className="rounded-sm border border-line px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-dim">
          {attribution.method.replace(/-/g, " ")}
        </span>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-faint">{attribution.note}</p>
      {attribution.slots.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-3">
          {attribution.slots.map((slot) => (
            <span key={slot.slot} className="text-[9px] uppercase tracking-wide text-faint">
              <span className={roleTone(slot.role)}>{roleLabel(slot.role)}</span>
              {" · slot "}{slot.slot + 1}
              {" · "}{slot.utterances} turns
              {" · "}{Math.round(slot.questionRate * 100)}% questions
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function FlowConnector({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="relative flex min-h-16 items-center justify-center border-y border-line bg-[#f8faf9] px-4 py-3">
      <span className={`absolute top-0 h-full w-px ${active ? "causal-line bg-[var(--accent)]" : "bg-line"}`} />
      <span className={`z-10 flex items-center gap-2 bg-[#f8faf9] px-3 text-center text-[10px] font-semibold ${active ? "text-[var(--accent)]" : "text-faint"}`}><ArrowDown size={11} />{label}</span>
    </div>
  );
}

function SignalReceipt({ signal, inverse, onEvidence }: { signal: TrendSignal; inverse: boolean; onEvidence: (id: string) => void }) {
  return (
    <div className={`border p-4 ${inverse ? "border-white/15 bg-white/5" : "border-line bg-white"}`}>
      <p className={`text-[9px] font-bold uppercase tracking-[.14em] ${inverse ? "text-[#8fc5b6]" : "text-[var(--accent)]"}`}>{signal.observation.replace(/_/g, " ")}</p>
      <p className="mt-3 text-[22px] font-semibold tabular">{signal.baseline ?? "—"} → {signal.current ?? "—"}</p>
      <p className={`mt-1 text-[10px] ${inverse ? "text-white/55" : "text-dim"}`}>{Math.round(signal.persistenceMs / 3_600_000)}h persistence · {signal.sampleCount} samples</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {signal.evidenceEventIds.map((id) => <button key={id} onClick={() => onEvidence(id)} className={`border-b text-[9px] ${inverse ? "border-white/30 text-white/70" : "border-[#8ba49c] text-[var(--accent)]"}`}>{id}</button>)}
      </div>
    </div>
  );
}

function TinyVital({ label, value }: { label: string; value: number | null }) {
  return <div><p className="text-[9px] font-bold uppercase text-faint">{label}</p><p className="mt-1 text-[13px] font-semibold tabular">{value ?? "—"}</p></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="border-l border-line pl-3"><p className="text-[9px] font-bold uppercase tracking-wide text-faint">{label}</p><p className="mt-1 break-all text-[10px] font-medium text-dim">{value}</p></div>;
}

function Wave({ levels, active }: { levels: number[]; active: boolean }) {
  return (
    <div className="flex h-14 items-center gap-[3px]" aria-label={active ? "Live microphone level" : "Microphone inactive"}>
      {levels.map((level, index) => <span key={index} className={`w-[3px] rounded-full bg-[var(--accent)] transition-[height] duration-75 ${active ? "opacity-90" : "opacity-20"}`} style={{ height: `${Math.max(5, Math.round(level * 52))}px` }} />)}
    </div>
  );
}

type VitalStep = { ts: number; spo2: number | null; heart_rate: number | null; respiratory_rate: number | null; systolic_bp: number | null };

function groupVitals(events: EchoEvent[]): VitalStep[] {
  const byTime = new Map<number, VitalStep>();
  for (const event of events) {
    const row = byTime.get(event.ts) ?? { ts: event.ts, spo2: null, heart_rate: null, respiratory_rate: null, systolic_bp: null };
    if (event.observation in row && typeof event.value === "number") {
      row[event.observation as keyof Omit<VitalStep, "ts">] = event.value;
    }
    byTime.set(event.ts, row);
  }
  return [...byTime.values()].sort((a, b) => a.ts - b.ts);
}

type RunAnswer = { headline: string; lines: string[]; evidenceIds: string[] };

function answerRunQuestion(question: string, run: DemoRunSnapshot, transcript: EchoEvent[], facts: EchoEvent[]): RunAnswer {
  const q = question.toLowerCase();
  const priority = run.priority;
  const concerning = run.trends?.signals.filter((signal) => signal.concerning) ?? [];
  if (q.includes("say") || q.includes("said") || q.includes("conversation")) {
    return { headline: `${transcript.length} transcript segment${transcript.length === 1 ? " was" : "s were"} captured in this encounter.`, lines: transcript.map((event) => `${event.speaker === "unknown" ? "Unresolved speaker" : event.speaker}: “${event.quote}”`), evidenceIds: transcript.map((event) => event.id) };
  }
  if (q.includes("why") || q.includes("priority") || q.includes("attention")) {
    return { headline: priority ? `${run.patient?.displayId ?? "P-014"} is ${priority.level.replace(/_/g, " ")} at ward rank #${priority.rank}.` : "No priority projection is available.", lines: priority?.reasons.slice(0, 4) ?? [], evidenceIds: priority?.evidenceEventIds ?? [] };
  }
  if (q.includes("oxygen") || q.includes("spo")) {
    const signal = run.trends?.signals.find((item) => item.observation === "spo2");
    return signal ? { headline: `SpO₂ moved from ${signal.baseline ?? "unknown"} to ${signal.current ?? "unknown"}.`, lines: [`Direction: ${signal.direction}. Persistence: ${Math.round(signal.persistenceMs / 3_600_000)} hours across ${signal.sampleCount} samples.`], evidenceIds: signal.evidenceEventIds } : { headline: "No oxygen trend is recorded yet.", lines: [], evidenceIds: [] };
  }
  if (q.includes("handoff") || q.includes("prepare")) {
    const proposal = run.proposals?.[0];
    return { headline: `Handoff context prepared for ${run.patient?.displayId ?? "P-014"}.`, lines: [`State: ${priority?.level.replace(/_/g, " ") ?? "GREEN"}, ward rank #${priority?.rank ?? "—"}.`, concerning.length ? `Concerning trends: ${concerning.map((signal) => signal.observation.replace(/_/g, " ")).join(", ")}.` : "No sustained concerning trend yet.", proposal ? `Prepared action: ${proposal.summary}` : "No workflow action is currently prepared."], evidenceIds: priority?.evidenceEventIds ?? [] };
  }
  return { headline: `${facts.length} new structured fact${facts.length === 1 ? "" : "s"} and ${run.monitorStep} monitor reading${run.monitorStep === 1 ? "" : "s"} are linked to this run.`, lines: [...facts.map((fact) => String(fact.value ?? fact.quote)), ...concerning.map((signal) => `${signal.observation.replace(/_/g, " ")}: ${signal.baseline ?? "—"} → ${signal.current ?? "—"}.`)], evidenceIds: [...facts.map((fact) => fact.id), ...concerning.flatMap((signal) => signal.evidenceEventIds)] };
}

function clinicalOffset(startedAt: number, ts: number) {
  const minutes = Math.max(0, Math.round((ts - startedAt) / 60_000));
  if (minutes < 60) return `+${minutes} clinical min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `+${hours}h${remainder ? ` ${remainder}m` : ""}`;
}

function formatDuration(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
