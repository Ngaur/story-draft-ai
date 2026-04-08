import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  ExternalLink,
} from "lucide-react";
import { useSessionStore } from "@/store/session";
import { StoryCard } from "@/components/ui/StoryCard";
import { StoryListSidebar } from "@/components/ui/StoryListSidebar";
import type { JiraCreationRequest, JiraIssueResult, UserStory } from "@/types";

export function ExportPanel() {
  const stories        = useSessionStore((s) => s.stories);
  const session        = useSessionStore((s) => s.session);
  const downloadArtifact = useSessionStore((s) => s.downloadArtifact);
  const createTickets  = useSessionStore((s) => s.createTickets);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [jiraOpen, setJiraOpen] = useState(false);
  const [jiraForm, setJiraForm] = useState({
    jira_url:    "",
    project_key: "",
    email:       "",
    api_token:   "",
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(stories.map((s) => s.id))
  );
  const [jiraResults, setJiraResults] = useState<{
    created: JiraIssueResult[];
    failed:  JiraIssueResult[];
  } | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  function toggleStory(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleCreateTickets() {
    const request: JiraCreationRequest = {
      ...jiraForm,
      story_ids: Array.from(selectedIds),
    };
    setIsCreating(true);
    try {
      const result = await createTickets(request);
      setJiraResults({ created: result.created_issues, failed: result.failed_issues });
    } finally {
      setIsCreating(false);
    }
  }

  const n          = stories.length;
  const safeIndex  = Math.min(selectedIndex, n - 1);
  const current    = stories[safeIndex];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Success banner — full width */}
      <div className="shrink-0 bg-green-50 border-b border-green-100 px-6 py-2.5 flex items-center gap-2.5">
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        <p className="text-green-700 text-sm font-medium">
          {n} {n === 1 ? "story" : "stories"} successfully generated — ready to export or push to Jira
        </p>
      </div>

      {/* Two-column body */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: story list ───────────────────────────────────────────── */}
        <StoryListSidebar
          stories={stories}
          selectedIndex={safeIndex}
          onSelect={setSelectedIndex}
          header={
            <p className="text-text-primary font-semibold text-sm">
              Stories
              <span className="ml-1.5 text-text-muted font-normal">({n})</span>
            </p>
          }
          footer={
            <p className="text-text-muted text-xs">Story {safeIndex + 1} of {n}</p>
          }
        />

        {/* ── Right: story detail ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Navigation bar + download */}
          <div className="shrink-0 border-b border-surface-border px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSelectedIndex((i) => Math.max(0, i - 1))}
                disabled={safeIndex === 0}
                className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Previous story"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-text-secondary text-sm tabular-nums px-1 min-w-[70px] text-center">
                {safeIndex + 1} / {n}
              </span>
              <button
                onClick={() => setSelectedIndex((i) => Math.min(n - 1, i + 1))}
                disabled={safeIndex === n - 1}
                className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Next story"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <button
              onClick={downloadArtifact}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors shadow-sm shrink-0"
            >
              <Download className="h-4 w-4" />
              Download DOCX
            </button>
          </div>

          {/* Story detail (scrollable) */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {current && (
              <StoryCard
                key={current.id}
                story={current}
                onChange={() => {}}
                readOnly
              />
            )}
          </div>

          {/* Jira section */}
          <div className="shrink-0 border-t border-surface-border">
            <button
              onClick={() => setJiraOpen((v) => !v)}
              className="w-full flex items-center justify-between px-6 py-3.5 text-text-secondary hover:text-text-primary transition-colors"
            >
              <span className="font-medium text-sm">Create Jira Tickets</span>
              {jiraOpen
                ? <ChevronUp className="h-4 w-4" />
                : <ChevronDown className="h-4 w-4" />
              }
            </button>

            {jiraOpen && (
              <div className="px-6 pb-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Jira URL"
                    value={jiraForm.jira_url}
                    onChange={(v) => setJiraForm((f) => ({ ...f, jira_url: v }))}
                    placeholder="https://yourorg.atlassian.net"
                  />
                  <Field
                    label="Project Key"
                    value={jiraForm.project_key}
                    onChange={(v) => setJiraForm((f) => ({ ...f, project_key: v }))}
                    placeholder="PROJ"
                  />
                  <Field
                    label="Email"
                    value={jiraForm.email}
                    onChange={(v) => setJiraForm((f) => ({ ...f, email: v }))}
                    placeholder="you@company.com"
                    type="email"
                  />
                  <Field
                    label="API Token"
                    value={jiraForm.api_token}
                    onChange={(v) => setJiraForm((f) => ({ ...f, api_token: v }))}
                    placeholder="Atlassian API token"
                    type="password"
                  />
                </div>

                <div>
                  <p className="text-text-muted text-xs font-medium uppercase tracking-wider mb-2">
                    Stories to create
                  </p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {stories.map((story) => (
                      <label
                        key={story.id}
                        className="flex items-center gap-2.5 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(story.id)}
                          onChange={() => toggleStory(story.id)}
                          className="accent-accent"
                        />
                        <span className="text-text-secondary text-sm truncate">{story.title}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleCreateTickets}
                  disabled={isCreating || selectedIds.size === 0 || !jiraForm.jira_url}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                >
                  {isCreating ? "Creating…" : "Create Tickets"}
                </button>

                {jiraResults && (
                  <div className="space-y-3">
                    {jiraResults.created.length > 0 && (
                      <div>
                        <p className="text-status-complete text-xs font-medium mb-1.5">
                          Created ({jiraResults.created.length})
                        </p>
                        {jiraResults.created.map((r) => (
                          <div key={r.story_id} className="flex items-center gap-2 text-sm">
                            <span className="text-accent font-medium">{r.issue_key}</span>
                            {r.issue_url && (
                              <a
                                href={r.issue_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-text-muted hover:text-accent"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {jiraResults.failed.length > 0 && (
                      <div>
                        <p className="text-status-error text-xs font-medium mb-1.5">
                          Failed ({jiraResults.failed.length})
                        </p>
                        {jiraResults.failed.map((r) => (
                          <p key={r.story_id} className="text-text-secondary text-xs">
                            {r.story_id}: {r.error}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="text-text-muted text-xs font-medium block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg bg-surface-card border border-surface-border px-3 py-2 text-text-secondary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent"
      />
    </div>
  );
}
