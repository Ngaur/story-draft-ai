import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Download, ExternalLink } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { StoryCard } from "@/components/ui/StoryCard";
import type { JiraCreationRequest, JiraIssueResult, UserStory } from "@/types";

export function ExportPanel() {
  const stories = useSessionStore((s) => s.stories);
  const session = useSessionStore((s) => s.session);
  const downloadArtifact = useSessionStore((s) => s.downloadArtifact);
  const createTickets = useSessionStore((s) => s.createTickets);

  const [jiraOpen, setJiraOpen] = useState(false);
  const [jiraForm, setJiraForm] = useState({
    jira_url: "",
    project_key: "",
    email: "",
    api_token: "",
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(stories.map((s) => s.id))
  );
  const [jiraResults, setJiraResults] = useState<{
    created: JiraIssueResult[];
    failed: JiraIssueResult[];
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

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Success banner */}
      <div className="bg-green-50 border-b border-green-100 px-8 py-2.5 flex items-center gap-2.5">
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        <p className="text-green-700 text-sm font-medium">
          {stories.length} {stories.length === 1 ? "story" : "stories"} successfully generated — ready to export or push to Jira
        </p>
      </div>

      <div className="border-b border-surface-border px-8 py-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-text-primary">User Stories</h2>
          <button
            onClick={downloadArtifact}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors shadow-sm"
          >
            <Download className="h-4 w-4" />
            Download DOCX
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
        {stories.map((story) => (
          <StoryCard
            key={story.id}
            story={story}
            onChange={() => {}}
            readOnly
          />
        ))}
      </div>

      {/* Jira section */}
      <div className="border-t border-surface-border">
        <button
          onClick={() => setJiraOpen((v) => !v)}
          className="w-full flex items-center justify-between px-8 py-4 text-text-secondary hover:text-text-primary transition-colors"
        >
          <span className="font-medium">Create Jira Tickets</span>
          {jiraOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {jiraOpen && (
          <div className="px-8 pb-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
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
              <p className="text-text-muted text-xs font-medium uppercase tracking-wider mb-3">
                Stories to create
              </p>
              <div className="space-y-2">
                {stories.map((story) => (
                  <label
                    key={story.id}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(story.id)}
                      onChange={() => toggleStory(story.id)}
                      className="accent-accent"
                    />
                    <span className="text-text-secondary text-sm">{story.title}</span>
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handleCreateTickets}
              disabled={isCreating || selectedIds.size === 0 || !jiraForm.jira_url}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors"
            >
              {isCreating ? "Creating…" : "Create Tickets"}
            </button>

            {jiraResults && (
              <div className="space-y-3">
                {jiraResults.created.length > 0 && (
                  <div>
                    <p className="text-status-complete text-xs font-medium mb-2">
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
                    <p className="text-status-error text-xs font-medium mb-2">
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
