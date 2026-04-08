import { useState } from "react";
import { AlertTriangle, FileClock, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listSessions, getSession, deleteSession } from "@/api/sessions";
import { useSessionStore } from "@/store/session";
import type { SessionRecord } from "@/types";

export function Sidebar() {
  const session           = useSessionStore((s) => s.session);
  const reset             = useSessionStore((s) => s.reset);
  const setViewingSession = useSessionStore((s) => s.setViewingSession);
  const viewingSession    = useSessionStore((s) => s.viewingSession);
  const queryClient       = useQueryClient();

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [isDeleting,   setIsDeleting]   = useState(false);

  const { data: pastSessions = [] } = useQuery({
    queryKey: ["past-sessions"],
    queryFn: listSessions,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const history = pastSessions.filter((p) => p.session_id !== session?.sessionId);

  const confirmingRecord = history.find((r) => r.session_id === confirmingId) ?? null;

  async function handleSelectSession(record: SessionRecord) {
    const detail = await getSession(record.session_id);
    setViewingSession(detail);
  }

  async function handleConfirmDelete() {
    if (!confirmingId) return;
    setIsDeleting(true);
    try {
      await deleteSession(confirmingId);
      if (viewingSession?.session_id === confirmingId) {
        setViewingSession(null);
      }
      queryClient.invalidateQueries({ queryKey: ["past-sessions"] });
    } finally {
      setIsDeleting(false);
      setConfirmingId(null);
    }
  }

  return (
    <>
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
            onClick={() => { reset(); setViewingSession(null); }}
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
              {history.map((record) => {
                const isActive = viewingSession?.session_id === record.session_id;
                return (
                  <div key={record.session_id} className="group relative">
                    <button
                      onClick={() => handleSelectSession(record)}
                      className={[
                        "w-full text-left px-4 py-3 border-l-2 transition-all duration-150 pr-9",
                        isActive
                          ? "border-l-accent bg-accent/5"
                          : "border-l-transparent hover:border-l-surface-border hover:bg-surface-hover",
                      ].join(" ")}
                    >
                      <div className="flex items-start gap-2">
                        <FileClock className="h-3.5 w-3.5 text-text-muted mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className={[
                            "text-xs font-medium truncate",
                            isActive ? "text-accent" : "text-text-secondary",
                          ].join(" ")}>
                            {record.filename}
                          </p>
                          <p className="text-text-muted text-xs mt-0.5">
                            {new Date(record.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </button>

                    {/* Delete button — visible on row hover */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmingId(record.session_id);
                      }}
                      title="Delete session"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-text-muted opacity-0 group-hover:opacity-100 hover:text-status-error hover:bg-red-50 transition-all duration-150"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </aside>

      {/* Confirmation dialog */}
      {confirmingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => !isDeleting && setConfirmingId(null)}
        >
          <div
            className="bg-surface-card rounded-2xl shadow-2xl border border-surface-border w-full max-w-sm mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-4 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-status-error" />
              </div>
              <div>
                <h3 className="text-text-primary font-semibold text-base leading-none">
                  Delete session?
                </h3>
                {confirmingRecord && (
                  <p className="text-text-secondary text-sm mt-1.5 leading-snug">
                    <span className="font-medium text-text-primary">
                      {confirmingRecord.filename}
                    </span>
                    {" "}and all its stories will be permanently removed. This cannot be undone.
                  </p>
                )}
              </div>
              <button
                onClick={() => !isDeleting && setConfirmingId(null)}
                disabled={isDeleting}
                className="ml-auto p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors shrink-0 disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Actions */}
            <div className="px-6 pb-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmingId(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg border border-surface-border text-text-secondary hover:bg-surface-hover disabled:opacity-40 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isDeleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
