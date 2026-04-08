import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { StoryCard } from "@/components/ui/StoryCard";
import { StoryListSidebar } from "@/components/ui/StoryListSidebar";
import { getArtifactUrl } from "@/api/chat";
import type { SessionDetail } from "@/types";

export function SessionViewer({ session }: { session: SessionDetail }) {
  const setViewingSession = useSessionStore((s) => s.setViewingSession);
  const [selectedIndex, setSelectedIndex] = useState(0);

  function handleDownload() {
    const url = getArtifactUrl(session.session_id);
    const a = document.createElement("a");
    a.href = url;
    a.download = "user_stories.docx";
    a.click();
  }

  const n         = session.stories.length;
  const safeIndex = Math.min(selectedIndex, Math.max(0, n - 1));
  const current   = session.stories[safeIndex];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Top header — filename + close */}
      <div className="shrink-0 border-b border-surface-border px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary leading-none">
            {session.filename}
          </h2>
          <p className="text-text-muted text-xs mt-0.5">
            {new Date(session.created_at).toLocaleString()} · {n}{" "}
            {n === 1 ? "story" : "stories"}
          </p>
        </div>
        <button
          onClick={() => setViewingSession(null)}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors shrink-0"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {n === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-text-muted text-sm">No stories saved for this session.</p>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* ── Left: story list ─────────────────────────────────────────── */}
          <StoryListSidebar
            stories={session.stories}
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

          {/* ── Right: story detail ───────────────────────────────────────── */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {/* Navigation + download */}
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

              {session.has_artifacts && (
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-border text-text-secondary hover:border-accent hover:text-accent transition-colors text-sm shrink-0"
                >
                  <Download className="h-4 w-4" />
                  Download DOCX
                </button>
              )}
            </div>

            {/* Story detail */}
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
          </div>
        </div>
      )}
    </div>
  );
}
