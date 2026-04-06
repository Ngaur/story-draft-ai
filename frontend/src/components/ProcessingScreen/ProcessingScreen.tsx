import { Check } from "lucide-react";
import { useSessionStore } from "@/store/session";

const STEPS = [
  { label: "Extract Concepts", hint: "Extracting concept nodes from your document…" },
  { label: "Clarify",          hint: "Generating clarifying questions…" },
  { label: "Draft Stories",    hint: "Drafting user stories based on your answers…" },
  { label: "Refine",           hint: "Refining stories based on your feedback…" },
];

function useCurrentStep(): number {
  const conceptNodes      = useSessionStore((s) => s.conceptNodes);
  const clarifyingQuestions = useSessionStore((s) => s.clarifyingQuestions);
  const stories           = useSessionStore((s) => s.stories);

  if (stories.length > 0)           return 3;
  if (clarifyingQuestions.length > 0) return 2;
  if (conceptNodes.length > 0)      return 1;
  return 0;
}

export function ProcessingScreen() {
  const currentStep = useCurrentStep();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-12 px-8">
      {/* Step indicator */}
      <div className="flex items-start">
        {STEPS.map((step, i) => (
          <div key={i} className="flex items-start">
            {/* Step node + label */}
            <div className="flex flex-col items-center gap-2.5 w-28">
              <div
                className={[
                  "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300",
                  i < currentStep
                    ? "bg-status-complete text-white"
                    : i === currentStep
                    ? "bg-accent text-white ring-4 ring-accent/20"
                    : "bg-surface-hover text-text-muted border border-surface-border",
                ].join(" ")}
              >
                {i < currentStep ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={[
                  "text-xs font-medium text-center leading-tight",
                  i === currentStep ? "text-text-primary" : "text-text-muted",
                ].join(" ")}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line — not after last step */}
            {i < STEPS.length - 1 && (
              <div
                className={[
                  "h-px w-16 mt-[18px] transition-colors duration-300",
                  i < currentStep ? "bg-status-complete" : "bg-surface-border",
                ].join(" ")}
              />
            )}
          </div>
        ))}
      </div>

      {/* Current hint */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-card border border-surface-border shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <p className="text-text-secondary text-sm">{STEPS[currentStep].hint}</p>
        </div>
      </div>
    </div>
  );
}
