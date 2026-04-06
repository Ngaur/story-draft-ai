import { Download, X } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { StoryCard } from "@/components/ui/StoryCard";
import { getArtifactUrl } from "@/api/chat";
import type { SessionDetail } from "@/types";

export function SessionViewer({ session }: { session: SessionDetail }) {
  const setViewingSession = useSessionStore((s) => s.setViewingSession);

  function handleDownload() {
    const url = getArtifactUrl(session.session_id);
    const a = document.createElement("a");
    a.href = url;
    a.download = "user_stories.docx";
    a.click();
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-surface-border px-8 py-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">{session.filename}</h2>
          <p className="text-text-secondary text-sm mt-1">
            {new Date(session.created_at).toLocaleString()} · {session.stories.length}{" "}
            {session.stories.length === 1 ? "story" : "stories"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {session.has_artifacts && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-border text-text-secondary hover:border-accent hover:text-accent transition-colors text-sm"
            >
              <Download className="h-4 w-4" />
              Download DOCX
            </button>
          )}
          <button
            onClick={() => setViewingSession(null)}
            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
        {session.stories.length === 0 ? (
          <p className="text-text-muted text-sm">No stories saved for this session.</p>
        ) : (
          session.stories.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              onChange={() => {}}
              readOnly
            />
          ))
        )}
      </div>
    </div>
  );
}
