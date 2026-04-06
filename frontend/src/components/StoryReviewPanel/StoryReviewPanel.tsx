import { useState } from "react";
import { CheckCheck, RefreshCw } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { StoryCard } from "@/components/ui/StoryCard";
import type { UserStory } from "@/types";

export function StoryReviewPanel() {
  const storeStories = useSessionStore((s) => s.stories);
  const submitReview = useSessionStore((s) => s.submitReview);
  const isSubmitting = useSessionStore((s) => s.isSubmitting);

  const [stories, setStories] = useState<UserStory[]>(() =>
    storeStories.map((s) => ({ ...s }))
  );
  const [feedback, setFeedback] = useState("");

  function updateStory(index: number, updated: UserStory) {
    setStories((prev) => prev.map((s, i) => (i === index ? updated : s)));
  }

  async function handleApprove() {
    await submitReview(stories, "");
  }

  async function handleRefinement() {
    if (!feedback.trim()) return;
    await submitReview(stories, feedback);
    setFeedback("");
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-surface-border px-8 py-5">
        <h2 className="text-xl font-semibold text-text-primary">Review User Stories</h2>
        <p className="text-text-secondary text-sm mt-1">
          Edit stories inline, then approve or request AI refinement.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
        {stories.map((story, i) => (
          <StoryCard
            key={story.id}
            story={story}
            onChange={(updated) => updateStory(i, updated)}
          />
        ))}
      </div>

      <div className="border-t border-surface-border px-8 py-5 space-y-4">
        <div>
          <label className="text-text-muted text-xs font-medium uppercase tracking-wider block mb-2">
            Refinement Feedback (optional)
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
            placeholder="Describe what you'd like changed across the stories…"
            className="w-full rounded-lg bg-surface-card border border-surface-border px-3 py-2 text-text-secondary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleRefinement}
            disabled={!feedback.trim() || isSubmitting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-surface-border text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Request Refinement
          </button>

          <button
            onClick={handleApprove}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors"
          >
            <CheckCheck className="h-4 w-4" />
            Approve & Export
          </button>
        </div>

        {isSubmitting && (
          <p className="text-status-processing text-sm animate-pulse">Submitting…</p>
        )}
      </div>
    </div>
  );
}
