import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Code2,
  FileText,
  GitBranch,
  Link2,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { UserStory } from "@/types";
import { changedSections } from "@/utils/storyDiff";

const PRIORITY_COLORS = {
  High: "text-priority-high bg-priority-high/10 border-priority-high/30",
  Medium: "text-priority-medium bg-priority-medium/10 border-priority-medium/30",
  Low: "text-priority-low bg-priority-low/10 border-priority-low/30",
};

const FIBONACCI = [1, 2, 3, 5, 8, 13];

interface StoryCardProps {
  story: UserStory;
  onChange: (updated: UserStory) => void;
  onDelete?: () => void;
  readOnly?: boolean;
  changedFields?: Set<string>;
  isNew?: boolean;
}

export function StoryCard({ story, onChange, onDelete, readOnly = false, changedFields, isNew = false }: StoryCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const changed = changedFields ? changedSections(changedFields) : new Set<string>();
  const headerChanged = changedFields
    ? ["epic_title", "title", "role", "want", "benefit", "story_points_estimate", "priority"]
        .some((f) => changedFields.has(f))
    : false;
  function update<K extends keyof UserStory>(field: K, value: UserStory[K]) {
    onChange({ ...story, [field]: value });
  }

  function updateListItem(field: keyof UserStory, index: number, value: string) {
    const list = [...(story[field] as string[])];
    list[index] = value;
    onChange({ ...story, [field]: list });
  }

  function addListItem(field: keyof UserStory) {
    const list = [...(story[field] as string[]), ""];
    onChange({ ...story, [field]: list });
  }

  function removeListItem(field: keyof UserStory, index: number) {
    const list = (story[field] as string[]).filter((_, i) => i !== index);
    onChange({ ...story, [field]: list });
  }

  return (
    <div className="rounded-xl bg-surface-card border border-surface-border border-l-[3px] border-l-accent overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      {/* ── Section 1 & 2: Header ─────────────────────────────────────────── */}
      <div className={`p-6 space-y-4 ${headerChanged ? "border-l-2 border-amber-400" : isNew ? "border-l-2 border-green-400" : ""}`}>
        {/* Epic badge + priority + points */}
        <div className="flex items-center gap-2 flex-wrap">
          {isNew && (
            <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5 tracking-wide">
              NEW
            </span>
          )}
          {readOnly ? (
            <span className="text-xs text-accent bg-accent/10 border border-accent/30 rounded px-2 py-0.5 font-medium">
              {story.epic_title || "—"}
            </span>
          ) : (
            <input
              value={story.epic_title}
              onChange={(e) => update("epic_title", e.target.value)}
              className="text-xs rounded border bg-accent/10 border-accent/30 text-accent px-2 py-0.5 focus:outline-none focus:border-accent w-48"
              placeholder="Epic title"
            />
          )}
          <div className="ml-auto flex items-center gap-2">
            {readOnly ? (
              <span className={`text-xs font-medium px-2 py-0.5 rounded border ${PRIORITY_COLORS[story.priority]}`}>
                {story.priority}
              </span>
            ) : (
              <select
                value={story.priority}
                onChange={(e) => update("priority", e.target.value as UserStory["priority"])}
                className="text-xs rounded border bg-surface border-surface-border text-text-secondary px-2 py-1 focus:outline-none focus:border-accent"
              >
                {["High", "Medium", "Low"].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            )}
            {readOnly ? (
              <span className="text-xs text-text-muted border border-surface-border rounded px-2 py-0.5">
                {story.story_points_estimate} pts
              </span>
            ) : (
              <select
                value={story.story_points_estimate}
                onChange={(e) => update("story_points_estimate", Number(e.target.value))}
                className="text-xs rounded border bg-surface border-surface-border text-text-secondary px-2 py-1 focus:outline-none focus:border-accent"
              >
                {FIBONACCI.map((n) => <option key={n} value={n}>{n} pts</option>)}
              </select>
            )}
            {!readOnly && onDelete && (
              confirmDelete ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { onDelete(); setConfirmDelete(false); }}
                    className="text-xs px-2 py-1 rounded bg-status-error text-white font-medium hover:opacity-90 transition-opacity"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs px-2 py-1 rounded border border-surface-border text-text-muted hover:text-text-secondary transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  title="Delete this story"
                  className="p-1.5 rounded-md text-text-muted hover:text-status-error hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )
            )}
          </div>
        </div>

        {/* Story title */}
        {readOnly ? (
          <h3 className="text-text-primary font-semibold text-base">{story.title}</h3>
        ) : (
          <input
            value={story.title}
            onChange={(e) => update("title", e.target.value)}
            className="w-full bg-transparent text-text-primary font-semibold text-base border-b border-transparent hover:border-surface-border focus:border-accent focus:outline-none pb-0.5 transition-colors"
            placeholder="Story title"
          />
        )}

        {/* Section 2: User story statement */}
        <div className="space-y-2 pl-3 border-l-2 border-accent/30">
          <InlineRow label="As a" value={story.role} onChange={(v) => update("role", v)} readOnly={readOnly} placeholder="user role" />
          <InlineRow label="I want" value={story.want} onChange={(v) => update("want", v)} readOnly={readOnly} placeholder="capability" multiline />
          <InlineRow label="So that" value={story.benefit} onChange={(v) => update("benefit", v)} readOnly={readOnly} placeholder="business benefit" multiline />
        </div>
      </div>

      {isNew && story.change_summary && (
        <NewStoryBanner summary={story.change_summary} />
      )}
      {!isNew && story.change_summary && changedFields && changedFields.size > 0 && (
        <ChangeSummaryBanner summary={story.change_summary} />
      )}

      <div className="divide-y divide-surface-border border-t border-surface-border">
        {/* Section 3: Detailed Description */}
        <Section label="Detailed Description" icon={FileText} defaultOpen isChanged={changed.has("Detailed Description")}>
          {readOnly ? (
            <p className="text-text-secondary text-sm whitespace-pre-wrap">{story.detailed_description}</p>
          ) : (
            <textarea
              value={story.detailed_description}
              onChange={(e) => update("detailed_description", e.target.value)}
              rows={4}
              placeholder="Context, scope, and constraints…"
              className="w-full rounded-lg bg-surface border border-surface-border px-3 py-2 text-text-secondary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
            />
          )}
        </Section>

        {/* Sections 4 & 5: Pre / Post Conditions */}
        <Section label="Pre-Conditions & Post-Conditions" icon={GitBranch} isChanged={changed.has("Pre-Conditions & Post-Conditions")}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <SectionLabel>Pre-Conditions</SectionLabel>
              <EditableList
                items={story.pre_conditions}
                readOnly={readOnly}
                onUpdate={(i, v) => updateListItem("pre_conditions", i, v)}
                onAdd={() => addListItem("pre_conditions")}
                onRemove={(i) => removeListItem("pre_conditions", i)}
                placeholder="Condition before story starts…"
              />
            </div>
            <div>
              <SectionLabel>Post-Conditions</SectionLabel>
              <EditableList
                items={story.post_conditions}
                readOnly={readOnly}
                onUpdate={(i, v) => updateListItem("post_conditions", i, v)}
                onAdd={() => addListItem("post_conditions")}
                onRemove={(i) => removeListItem("post_conditions", i)}
                placeholder="Condition after story completes…"
              />
            </div>
          </div>
        </Section>

        {/* Section 6: Data Governance */}
        <Section label="Data Governance" icon={Shield} isChanged={changed.has("Data Governance")}>
          <EditableList
            items={story.data_governance}
            readOnly={readOnly}
            onUpdate={(i, v) => updateListItem("data_governance", i, v)}
            onAdd={() => addListItem("data_governance")}
            onRemove={(i) => removeListItem("data_governance", i)}
            placeholder="Data handling, encryption, PCI DSS, masking, retention…"
            emptyMessage="No data governance considerations."
          />
        </Section>

        {/* Section 7: Acceptance Criteria */}
        <Section label="Acceptance Criteria" icon={CheckSquare} defaultOpen isChanged={changed.has("Acceptance Criteria")}>
          <EditableList
            items={story.acceptance_criteria}
            readOnly={readOnly}
            onUpdate={(i, v) => updateListItem("acceptance_criteria", i, v)}
            onAdd={() => addListItem("acceptance_criteria")}
            onRemove={(i) => removeListItem("acceptance_criteria", i)}
            placeholder="Given … When … Then …"
            multilineItems
          />
        </Section>

        {/* Sections 8 & 9: Assumptions & Assertions */}
        <Section label="Assumptions & Assertions" icon={AlertCircle} isChanged={changed.has("Assumptions & Assertions")}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <SectionLabel>Assumptions</SectionLabel>
              <EditableList
                items={story.assumptions}
                readOnly={readOnly}
                onUpdate={(i, v) => updateListItem("assumptions", i, v)}
                onAdd={() => addListItem("assumptions")}
                onRemove={(i) => removeListItem("assumptions", i)}
                placeholder="Unconfirmed assumption…"
              />
            </div>
            <div>
              <SectionLabel>Out of Scope / Assertions</SectionLabel>
              <EditableList
                items={story.assertions}
                readOnly={readOnly}
                onUpdate={(i, v) => updateListItem("assertions", i, v)}
                onAdd={() => addListItem("assertions")}
                onRemove={(i) => removeListItem("assertions", i)}
                placeholder="Explicitly excluded item…"
              />
            </div>
          </div>
        </Section>

        {/* Section 10: Edge Cases */}
        <Section label="Edge Cases & Error Scenarios" icon={AlertTriangle} isChanged={changed.has("Edge Cases & Error Scenarios")}>
          <EditableList
            items={story.edge_cases}
            readOnly={readOnly}
            onUpdate={(i, v) => updateListItem("edge_cases", i, v)}
            onAdd={() => addListItem("edge_cases")}
            onRemove={(i) => removeListItem("edge_cases", i)}
            placeholder="Edge case or failure scenario…"
            multilineItems
          />
        </Section>

        {/* Section 11: Dependencies */}
        <Section label="Dependencies" icon={Link2} isChanged={changed.has("Dependencies")}>
          <EditableList
            items={story.dependencies}
            readOnly={readOnly}
            onUpdate={(i, v) => updateListItem("dependencies", i, v)}
            onAdd={() => addListItem("dependencies")}
            onRemove={(i) => removeListItem("dependencies", i)}
            placeholder="System, team, or data dependency…"
          />
        </Section>

        {/* Sections 12 & 13: Example Data & Test Scenarios */}
        <Section label="Example Data & Test Scenarios" icon={Code2} isChanged={changed.has("Example Data & Test Scenarios")}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <SectionLabel>Example Data & Scenarios</SectionLabel>
              <EditableList
                items={story.example_data}
                readOnly={readOnly}
                onUpdate={(i, v) => updateListItem("example_data", i, v)}
                onAdd={() => addListItem("example_data")}
                onRemove={(i) => removeListItem("example_data", i)}
                placeholder="Realistic example for dev/QA…"
                multilineItems
              />
            </div>
            <div>
              <SectionLabel>Test Scenarios</SectionLabel>
              <EditableList
                items={story.test_scenarios}
                readOnly={readOnly}
                onUpdate={(i, v) => updateListItem("test_scenarios", i, v)}
                onAdd={() => addListItem("test_scenarios")}
                onRemove={(i) => removeListItem("test_scenarios", i)}
                placeholder="Functional or non-functional test case…"
                multilineItems
              />
            </div>
          </div>
        </Section>

        {/* Section 14: Definition of Done */}
        <Section label="Definition of Done" icon={CheckCircle2} defaultOpen isChanged={changed.has("Definition of Done")}>
          <EditableList
            items={story.definition_of_done}
            readOnly={readOnly}
            onUpdate={(i, v) => updateListItem("definition_of_done", i, v)}
            onAdd={() => addListItem("definition_of_done")}
            onRemove={(i) => removeListItem("definition_of_done", i)}
            placeholder="Completion criterion…"
          />
        </Section>
      </div>
    </div>
  );
}

// ── Internal sub-components ───────────────────────────────────────────────────

function Section({
  label,
  icon: Icon,
  children,
  defaultOpen = false,
  isChanged = false,
}: {
  label: string;
  icon?: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
  isChanged?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen || isChanged);

  return (
    <div className={isChanged ? "border-l-2 border-amber-400" : ""}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-3 text-left hover:bg-surface-hover transition-colors group"
      >
        <span className="flex items-center gap-2">
          {Icon && (
            <Icon className={`h-3.5 w-3.5 transition-colors ${
              isChanged ? "text-amber-400" : "text-accent/60 group-hover:text-accent"
            }`} />
          )}
          <span className={`text-xs font-semibold uppercase tracking-wider ${
            isChanged ? "text-amber-700" : "text-text-muted"
          }`}>
            {label}
          </span>
          {isChanged && (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 ml-0.5" />
          )}
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-text-muted" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
        )}
      </button>
      {open && <div className="px-6 pb-5">{children}</div>}
    </div>
  );
}

function NewStoryBanner({ summary }: { summary: string }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className="mx-6 mb-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex items-start gap-3">
      <Sparkles className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
      <p className="text-green-800 text-xs leading-relaxed flex-1">{summary}</p>
      <button
        onClick={() => setOpen(false)}
        className="text-green-400 hover:text-green-600 transition-colors shrink-0"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ChangeSummaryBanner({ summary }: { summary: string }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className="mx-6 mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
      <Sparkles className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
      <p className="text-amber-800 text-xs leading-relaxed flex-1">{summary}</p>
      <button
        onClick={() => setOpen(false)}
        className="text-amber-400 hover:text-amber-600 transition-colors shrink-0"
        aria-label="Dismiss change summary"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-text-muted text-xs font-medium mb-2">{children}</p>
  );
}

function InlineRow({
  label,
  value,
  onChange,
  readOnly,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-text-muted text-xs font-medium w-14 shrink-0">{label}</span>
      {readOnly ? (
        <span className="text-text-secondary text-sm">{value}</span>
      ) : multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          placeholder={placeholder}
          className="flex-1 rounded-lg bg-surface border border-surface-border px-3 py-1.5 text-text-secondary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-lg bg-surface border border-surface-border px-3 py-1.5 text-text-secondary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
      )}
    </div>
  );
}

function EditableList({
  items,
  readOnly,
  onUpdate,
  onAdd,
  onRemove,
  placeholder,
  emptyMessage,
  multilineItems,
}: {
  items: string[];
  readOnly: boolean;
  onUpdate: (index: number, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  placeholder: string;
  emptyMessage?: string;
  multilineItems?: boolean;
}) {
  if (readOnly && items.length === 0) {
    return <p className="text-text-muted text-xs italic">{emptyMessage ?? "None specified."}</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-text-muted text-sm mt-2 shrink-0">•</span>
          {readOnly ? (
            <p className="text-text-secondary text-sm py-1 whitespace-pre-wrap">{item}</p>
          ) : (
            <>
              {multilineItems ? (
                <textarea
                  value={item}
                  onChange={(e) => onUpdate(i, e.target.value)}
                  rows={2}
                  placeholder={placeholder}
                  className="flex-1 rounded-lg bg-surface border border-surface-border px-3 py-2 text-text-secondary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
                />
              ) : (
                <input
                  value={item}
                  onChange={(e) => onUpdate(i, e.target.value)}
                  placeholder={placeholder}
                  className="flex-1 rounded-lg bg-surface border border-surface-border px-3 py-1.5 text-text-secondary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
              )}
              <button
                onClick={() => onRemove(i)}
                className="mt-2 text-text-muted hover:text-status-error transition-colors shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      ))}
      {!readOnly && (
        <button
          onClick={onAdd}
          className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors mt-1"
        >
          <Plus className="h-3.5 w-3.5" />
          Add item
        </button>
      )}
    </div>
  );
}
