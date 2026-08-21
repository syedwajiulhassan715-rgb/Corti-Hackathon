"use client";

import { useState } from "react";
import { PatientPanel } from "@/components/PatientPanel";
import { DEMO_STEPS, momentForStep } from "@/lib/api";

export function PatientRoute({ patientId }: { patientId: string }) {
  const [step, setStep] = useState(DEMO_STEPS);
  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <a href="/ward/" className="text-tiny font-medium text-[var(--accent)]">← Ward</a>
          <label className="flex items-center gap-3 text-tiny text-faint">
            Replay step {step}
            <input type="range" min={0} max={DEMO_STEPS} value={step} onChange={(event) => setStep(Number(event.target.value))} className="accent-[var(--accent)]" />
          </label>
        </div>
        <PatientPanel patientId={patientId} until={momentForStep(step)} />
      </div>
    </main>
  );
}
