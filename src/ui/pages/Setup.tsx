import { useState, useMemo } from "react";
import { WalletStep } from "./setup/WalletStep.js";
import { RegisterStep } from "./setup/RegisterStep.js";
import { LLMStep } from "./setup/LLMStep.js";
import { SpecializationStep } from "./setup/SpecializationStep.js";

type StepId = "wallet" | "register" | "llm" | "specialization";

interface StepDef {
  id: StepId;
  label: string;
}

const ALL_STEPS: StepDef[] = [
  { id: "wallet", label: "WALLET" },
  { id: "register", label: "REGISTER" },
  { id: "llm", label: "BRAIN" },
  { id: "specialization", label: "DEPLOY" },
];

interface SetupProps {
  onComplete: () => void;
}

export function Setup({ onComplete }: SetupProps) {
  const [step, setStep] = useState(0);
  const [skipRegister, setSkipRegister] = useState(false);

  const steps = useMemo(
    () => (skipRegister ? ALL_STEPS.filter((s) => s.id !== "register") : ALL_STEPS),
    [skipRegister],
  );

  function next() {
    if (step < steps.length - 1) {
      setStep(step + 1);
    }
  }

  function handleWalletNext(existingAgentId?: string) {
    if (existingAgentId) {
      setSkipRegister(true);
      setStep(1);
    } else {
      next();
    }
  }

  const currentStepId = steps[step]?.id;

  return (
    <div className="min-h-screen flex flex-col scanlines">
      {/* Header */}
      <header className="border-b border-red-500/8 px-5 py-2.5 bg-zinc-950/95">
        <div className="flex items-center gap-3">
          <div className="w-2 h-5 bg-red-500 rounded-[1px] glow-red" />
          <div>
            <h1 className="text-sm font-bold tracking-wide text-zinc-100 font-mono leading-none">
              CASHCLAW
            </h1>
            <p className="text-[8px] text-red-500/50 font-mono tracking-[0.25em] leading-none mt-0.5">
              SYSTEM SETUP
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-6 py-12">
        {/* Progress */}
        {step > 0 && (
          <div className="flex items-center gap-1 mb-10">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-center gap-1">
                <div
                  className={`w-6 h-6 rounded-sm flex items-center justify-center text-[10px] font-mono font-bold transition-all ${
                    i < step
                      ? "bg-red-600 text-white"
                      : i === step
                        ? "bg-zinc-100 text-zinc-900"
                        : "bg-zinc-900 text-zinc-700 border border-zinc-800"
                  }`}
                >
                  {i < step ? "\u2713" : i + 1}
                </div>
                <span
                  className={`text-[9px] font-mono font-bold tracking-wider mr-1 ${
                    i <= step ? "text-zinc-400" : "text-zinc-800"
                  }`}
                >
                  {s.label}
                </span>
                {i < steps.length - 1 && (
                  <div className={`w-6 h-px ${i < step ? "bg-red-800" : "bg-zinc-800"}`} />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="w-full max-w-lg">
          {currentStepId === "wallet" && <WalletStep onNext={handleWalletNext} />}
          {currentStepId === "register" && (
            <RegisterStep onNext={() => { next(); }} />
          )}
          {currentStepId === "llm" && <LLMStep onNext={next} />}
          {currentStepId === "specialization" && <SpecializationStep onComplete={onComplete} />}
        </div>
      </main>
    </div>
  );
}
