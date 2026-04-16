import { useState } from "react";
import { CheckCircle2, HelpCircle, SkipForward } from "lucide-react";
import { useSessionStore } from "@/store/session";
import type { ClarificationAnswer, ClarifyingQuestion, ConceptNode } from "@/types";

export function ClarificationPanel() {
  const conceptNodes = useSessionStore((s) => s.conceptNodes);
  const clarifyingQuestions = useSessionStore((s) => s.clarifyingQuestions);
  const submitClarificationAnswers = useSessionStore((s) => s.submitClarificationAnswers);
  const isSubmitting = useSessionStore((s) => s.isSubmitting);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const questionsByConceptId = clarifyingQuestions.reduce<Record<string, ClarifyingQuestion[]>>(
    (acc, q) => {
      if (!acc[q.concept_id]) acc[q.concept_id] = [];
      acc[q.concept_id].push(q);
      return acc;
    },
    {}
  );

  const totalQuestions = clarifyingQuestions.length;

  const decidedCount = clarifyingQuestions.filter((q) => {
    const key = `${q.concept_id}::${q.question_text}`;
    return skipped.has(key) || (answers[key] ?? "").trim().length > 0;
  }).length;

  const answeredCount = clarifyingQuestions.filter((q) => {
    const key = `${q.concept_id}::${q.question_text}`;
    return !skipped.has(key) && (answers[key] ?? "").trim().length > 0;
  }).length;

  const allDecided = decidedCount === totalQuestions;
  const progressPct = totalQuestions > 0 ? Math.round((decidedCount / totalQuestions) * 100) : 0;
  const unansweredCount = totalQuestions - decidedCount;

  function getKey(conceptId: string, questionText: string) {
    return `${conceptId}::${questionText}`;
  }

  function setAnswer(conceptId: string, questionText: string, value: string) {
    const key = getKey(conceptId, questionText);
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setSkipped((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function skipAllUnanswered() {
    setSkipped((prev) => {
      const next = new Set(prev);
      for (const q of clarifyingQuestions) {
        const key = getKey(q.concept_id, q.question_text);
        if (!next.has(key) && !(answers[key] ?? "").trim()) {
          next.add(key);
        }
      }
      return next;
    });
  }

  function toggleSkip(conceptId: string, questionText: string) {
    const key = getKey(conceptId, questionText);
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        setAnswers((a) => ({ ...a, [key]: "" }));
      }
      return next;
    });
  }

  function isSkipped(conceptId: string, questionText: string) {
    return skipped.has(getKey(conceptId, questionText));
  }

  function getAnswer(conceptId: string, questionText: string): string {
    return answers[getKey(conceptId, questionText)] ?? "";
  }

  async function handleSubmit() {
    const built: ClarificationAnswer[] = clarifyingQuestions
      .filter((q) => {
        const key = getKey(q.concept_id, q.question_text);
        return !skipped.has(key) && (answers[key] ?? "").trim().length > 0;
      })
      .map((q) => ({
        concept_id: q.concept_id,
        question_text: q.question_text,
        answer: getAnswer(q.concept_id, q.question_text),
      }));

    await submitClarificationAnswers(built);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-surface-border px-8 py-5 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-text-primary">Clarifying Questions</h2>
            <p className="text-text-secondary text-sm mt-1">
              Answer what you know — skip anything that doesn't apply.
            </p>
          </div>
          <div className="text-right shrink-0 ml-4">
            <p className="text-2xl font-bold text-text-primary tabular-nums">{progressPct}%</p>
            <p className="text-text-muted text-xs">
              {answeredCount} answered · {skipped.size} skipped · {totalQuestions} total
            </p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="w-full h-1.5 bg-surface-hover rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Questions */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-10">
        {conceptNodes.map((concept: ConceptNode) => {
          const questions = questionsByConceptId[concept.id] ?? [];
          if (!questions.length) return null;
          return (
            <ConceptSection
              key={concept.id}
              concept={concept}
              questions={questions}
              getAnswer={getAnswer}
              setAnswer={setAnswer}
              isSkipped={isSkipped}
              toggleSkip={toggleSkip}
            />
          );
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-surface-border px-8 py-5 flex items-center gap-4 bg-surface-card">
        <button
          onClick={handleSubmit}
          disabled={!allDecided || isSubmitting}
          className="px-6 py-2.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors shadow-sm"
        >
          {isSubmitting ? "Submitting…" : "Generate Stories"}
        </button>
        {!allDecided && !isSubmitting && (
          <>
            <button
              onClick={skipAllUnanswered}
              className="px-4 py-2 rounded-lg border border-surface-border text-text-secondary text-sm font-medium hover:border-text-muted hover:text-text-primary transition-colors bg-surface"
            >
              Skip All Unanswered
            </button>
            <p className="text-text-muted text-xs">
              {unansweredCount} question{unansweredCount !== 1 ? "s" : ""} remaining
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ConceptSection({
  concept,
  questions,
  getAnswer,
  setAnswer,
  isSkipped,
  toggleSkip,
}: {
  concept: ConceptNode;
  questions: ClarifyingQuestion[];
  getAnswer: (cid: string, qt: string) => string;
  setAnswer: (cid: string, qt: string, val: string) => void;
  isSkipped: (cid: string, qt: string) => boolean;
  toggleSkip: (cid: string, qt: string) => void;
}) {
  return (
    <div>
      <div className="mb-4">
        <h3 className="text-text-primary font-semibold text-base">{concept.title}</h3>
        <p className="text-text-secondary text-sm mt-0.5 max-w-2xl">{concept.description}</p>
      </div>
      <div className="space-y-3">
        {questions.map((q) => (
          <QuestionField
            key={q.question_text}
            question={q}
            value={getAnswer(q.concept_id, q.question_text)}
            skipped={isSkipped(q.concept_id, q.question_text)}
            onChange={(val) => setAnswer(q.concept_id, q.question_text, val)}
            onSkip={() => toggleSkip(q.concept_id, q.question_text)}
          />
        ))}
      </div>
    </div>
  );
}

function QuestionField({
  question,
  value,
  skipped,
  onChange,
  onSkip,
}: {
  question: ClarifyingQuestion;
  value: string;
  skipped: boolean;
  onChange: (val: string) => void;
  onSkip: () => void;
}) {
  const answered = !skipped && value.trim().length > 0;

  const cardBorder = answered
    ? "border-l-[3px] border-l-status-complete"
    : skipped
    ? "border-l-[3px] border-l-surface-border opacity-60"
    : "border-l-[3px] border-l-surface-border hover:border-l-accent/40";

  return (
    <div
      className={[
        "bg-surface-card rounded-xl border border-surface-border shadow-sm p-4 transition-all duration-150",
        cardBorder,
      ].join(" ")}
    >
      <div className="flex gap-3">
        {/* Status icon */}
        <div className="mt-0.5 shrink-0">
          {skipped ? (
            <SkipForward className="h-4 w-4 text-text-muted" />
          ) : answered ? (
            <CheckCircle2 className="h-4 w-4 text-status-complete" />
          ) : (
            <HelpCircle className="h-4 w-4 text-text-muted" />
          )}
        </div>

        {/* Question body */}
        <div className="flex-1 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <p className={`text-sm font-medium leading-snug ${skipped ? "text-text-muted line-through" : "text-text-primary"}`}>
              {question.question_text}
            </p>
            <button
              onClick={onSkip}
              title={skipped ? "Unskip question" : "Skip this question"}
              className={[
                "shrink-0 text-xs px-2.5 py-1 rounded-md border font-medium transition-colors",
                skipped
                  ? "border-accent/40 text-accent bg-accent/10 hover:bg-accent/20"
                  : "border-surface-border text-text-muted hover:border-text-muted hover:text-text-secondary bg-surface",
              ].join(" ")}
            >
              {skipped ? "Unskip" : "Skip"}
            </button>
          </div>

          {/* Input — hidden when skipped */}
          {!skipped && (
            <>
              {question.question_type === "open" && (
                <textarea
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  rows={3}
                  placeholder="Your answer…"
                  className="w-full rounded-lg bg-surface border border-surface-border px-3 py-2 text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
                />
              )}

              {question.question_type === "yes_no" && (
                <div className="flex gap-3">
                  {["Yes", "No"].map((opt) => (
                    <label
                      key={opt}
                      className={[
                        "flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer text-sm font-medium transition-colors",
                        value === opt
                          ? "border-accent bg-accent/5 text-accent"
                          : "border-surface-border text-text-secondary hover:border-accent/40",
                      ].join(" ")}
                    >
                      <input
                        type="radio"
                        name={question.question_text}
                        value={opt}
                        checked={value === opt}
                        onChange={() => onChange(opt)}
                        className="hidden"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              )}

              {question.question_type === "multiple_choice" && question.options && (() => {
                const baseOptions = question.options;
                // "Others" is selected when value is non-empty and not one of the predefined options
                const isOthersSelected = value !== "" && !baseOptions.includes(value);
                // Show empty in the text box when value is the "Others" placeholder (not yet typed)
                const othersTextValue = isOthersSelected && value !== "Others" ? value : "";
                return (
                  <div className="flex flex-col gap-2">
                    {baseOptions.map((opt) => (
                      <label
                        key={opt}
                        className={[
                          "flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors",
                          value === opt
                            ? "border-accent bg-accent/5 text-accent"
                            : "border-surface-border text-text-secondary hover:border-accent/40",
                        ].join(" ")}
                      >
                        <input
                          type="radio"
                          name={question.question_text}
                          value={opt}
                          checked={value === opt}
                          onChange={() => onChange(opt)}
                          className="hidden"
                        />
                        <span className={[
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                          value === opt ? "border-accent" : "border-surface-border",
                        ].join(" ")}>
                          {value === opt && <span className="w-2 h-2 rounded-full bg-accent" />}
                        </span>
                        {opt}
                      </label>
                    ))}
                    {/* Others option */}
                    <label
                      className={[
                        "flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors",
                        isOthersSelected
                          ? "border-accent bg-accent/5 text-accent"
                          : "border-surface-border text-text-secondary hover:border-accent/40",
                      ].join(" ")}
                    >
                      <input
                        type="radio"
                        name={question.question_text}
                        value="Others"
                        checked={isOthersSelected}
                        onChange={() => onChange("Others")}
                        className="hidden"
                      />
                      <span className={[
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                        isOthersSelected ? "border-accent" : "border-surface-border",
                      ].join(" ")}>
                        {isOthersSelected && <span className="w-2 h-2 rounded-full bg-accent" />}
                      </span>
                      Others
                    </label>
                    {isOthersSelected && (
                      <input
                        autoFocus
                        value={othersTextValue}
                        onChange={(e) => onChange(e.target.value.trim() || "Others")}
                        placeholder="Please specify…"
                        className="w-full rounded-lg bg-surface border border-accent/40 px-3 py-2 text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent"
                      />
                    )}
                  </div>
                );
              })()}

              {question.question_type === "multiple_select" && question.options && (() => {
                const baseOptions = question.options;
                const selected = value
                  ? value.split(",").map((s) => s.trim()).filter(Boolean)
                  : [];
                // The "Others" custom value is any selected item that isn't one of the base options
                const othersVal = selected.find((s) => !baseOptions.includes(s)) ?? null;
                const isOthersChecked = othersVal !== null;
                const othersTextValue = othersVal ?? "";
                return (
                  <div className="flex flex-col gap-2">
                    <p className="text-text-muted text-xs font-medium">Select all that apply</p>
                    {baseOptions.map((opt) => {
                      const isChecked = selected.includes(opt);
                      return (
                        <label
                          key={opt}
                          className={[
                            "flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors",
                            isChecked
                              ? "border-accent bg-accent/5 text-accent"
                              : "border-surface-border text-text-secondary hover:border-accent/40",
                          ].join(" ")}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const next = isChecked
                                ? selected.filter((s) => s !== opt)
                                : [...selected, opt];
                              onChange(next.join(", "));
                            }}
                            className="hidden"
                          />
                          <span className={[
                            "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0",
                            isChecked ? "border-accent bg-accent" : "border-surface-border",
                          ].join(" ")}>
                            {isChecked && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                                <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          {opt}
                        </label>
                      );
                    })}
                    {/* Others option */}
                    <label
                      className={[
                        "flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors",
                        isOthersChecked
                          ? "border-accent bg-accent/5 text-accent"
                          : "border-surface-border text-text-secondary hover:border-accent/40",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        checked={isOthersChecked}
                        onChange={() => {
                          if (isOthersChecked) {
                            // Remove the custom/Others value from selection
                            const next = selected.filter((s) => baseOptions.includes(s));
                            onChange(next.join(", "));
                          } else {
                            // Add "Others" as a literal placeholder — text input replaces it when typed
                            onChange([...selected, "Others"].join(", "));
                          }
                        }}
                        className="hidden"
                      />
                      <span className={[
                        "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0",
                        isOthersChecked ? "border-accent bg-accent" : "border-surface-border",
                      ].join(" ")}>
                        {isOthersChecked && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                            <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      Others
                    </label>
                    {isOthersChecked && (
                      <input
                        autoFocus
                        value={othersTextValue === "Others" ? "" : othersTextValue}
                        onChange={(e) => {
                          // Replace the custom/Others entry with typed text; fall back to "Others" if cleared
                          const customText = e.target.value.trim() || "Others";
                          const withoutCustom = selected.filter((s) => baseOptions.includes(s));
                          onChange([...withoutCustom, customText].join(", "));
                        }}
                        placeholder="Please specify…"
                        className="w-full rounded-lg bg-surface border border-accent/40 px-3 py-2 text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent"
                      />
                    )}
                  </div>
                );
              })()}
            </>
          )}

          {skipped && (
            <p className="text-text-muted text-xs italic">
              Skipped — the AI will infer this from context and flag it as an assumption.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
