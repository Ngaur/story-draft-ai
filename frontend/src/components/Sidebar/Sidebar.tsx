import { FileClock, Plus, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { listSessions, getSession } from "@/api/sessions";
import { useSessionStore } from "@/store/session";
import type { SessionRecord } from "@/types";

export function Sidebar() {
  const session = useSessionStore((s) => s.session);
  const reset = useSessionStore((s) => s.reset);
  const setViewingSession = useSessionStore((s) => s.setViewingSession);
  const viewingSession = useSessionStore((s) => s.viewingSession);

  const { data: pastSessions = [] } = useQuery({
    queryKey: ["past-sessions"],
    queryFn: listSessions,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const history = pastSessions.filter((p) => p.session_id !== session?.sessionId);

  async function handleSelectSession(record: SessionRecord) {
    const detail = await getSession(record.session_id);
    setViewingSession(detail);
  }

  return (
    <aside className="w-64 shrink-0 bg-[#eef2f7] border-r border-surface-border flex flex-col">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-surface-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <h1 className="text-text-primary font-semibold text-sm tracking-tight leading-none">
              story-draft-ai
            </h1>
            <p className="text-text-muted text-xs mt-0.5">Concept → Jira story</p>
          </div>
        </div>
      </div>

      {/* New session button */}
      <div className="px-4 py-3 border-b border-surface-border">
        <button
          onClick={() => {
            reset();
            setViewingSession(null);
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-accent/30 bg-accent/5 text-accent hover:bg-accent hover:text-white font-medium text-sm transition-all duration-150"
        >
          <Plus className="h-4 w-4" />
          New Session
        </button>
      </div>

      {/* History */}
      <div className="flex-1 overflow-y-auto py-3">
        {history.length === 0 ? (
          <p className="text-text-muted text-xs px-5 py-2">No past sessions yet.</p>
        ) : (
          <>
            <p className="text-text-muted text-xs font-semibold uppercase tracking-wider px-5 mb-2">
              History
            </p>
            {history.map((record) => (
              <button
                key={record.session_id}
                onClick={() => handleSelectSession(record)}
                className={[
                  "w-full text-left px-4 py-3 border-l-2 transition-all duration-150",
                  viewingSession?.session_id === record.session_id
                    ? "border-l-accent bg-accent/5"
                    : "border-l-transparent hover:border-l-surface-border hover:bg-surface-hover",
                ].join(" ")}
              >
                <div className="flex items-start gap-2">
                  <FileClock className="h-3.5 w-3.5 text-text-muted mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className={[
                      "text-xs font-medium truncate",
                      viewingSession?.session_id === record.session_id
                        ? "text-accent"
                        : "text-text-secondary",
                    ].join(" ")}>
                      {record.filename}
                    </p>
                    <p className="text-text-muted text-xs mt-0.5">
                      {new Date(record.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}
