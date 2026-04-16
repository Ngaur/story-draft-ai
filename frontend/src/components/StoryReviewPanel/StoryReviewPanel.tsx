import { useState, useEffect, useMemo } from "react";
import { CheckCheck, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { StoryCard } from "@/components/ui/StoryCard";
import { StoryListSidebar } from "@/components/ui/StoryListSidebar";
import { computeChangedFields } from "@/utils/storyDiff";
import type { UserStory } from "@/types";

export function StoryReviewPanel() {
  const storeStories    = useSessionStore((s) => s.stories);
  const previousStories = useSessionStore((s) => s.previousStories);
  const submitReview    = useSessionStore((s) => s.submitReview);
  const isSubmitting    = useSessionStore((s) => s.isSubmitting);

  const [stories, setStories] = useState<UserStory[]>(() =>
    storeStories.map((s) => ({ ...s }))
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [feedback, setFeedback] = useState("");

  // When refined stories arrive via polling, sync local state and try to keep selection
  useEffect(() => {
    const currentId = stories[selectedIndex]?.id;
    const updated = storeStories.map((s) => ({ ...s }));
    setStories(updated);
    if (currentId) {
      const newIdx = updated.findIndex((s) => s.id === currentId);
      setSelectedIndex(newIdx >= 0 ? newIdx : 0);
    }
  }, [storeStories]);

  // Per-story changed-field sets (diff snapshot vs refined stories)
  const changedFieldsById = useMemo<Map<string, Set<string>>>(() => {
    if (previousStories.length === 0) return new Map();
    const prevMap = new Map(previousStories.map((s) => [s.id, s]));
    const result  = new Map<string, Set<string>>();
    for (const story of storeStories) {
      const prev = prevMap.get(story.id);
      if (prev) result.set(story.id, computeChangedFields(prev, story));
    }
    return result;
  }, [storeStories, previousStories]);

  function updateStory(index: number, updated: UserStory) {
    setStories((prev) => prev.map((s, i) => (i === index ? updated : s)));
  }

  function deleteStory(index: number) {
    setStories((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next;
    });
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, stories.length - 2)));
  }

  async function handleApprove() {
    await submitReview(stories, "");
  }

  async function handleRefinement() {
    if (!feedback.trim()) return;
    await submitReview(stories, feedback);
    setFeedback("");
  }

  const n = stories.length;
  const safeIndex = Math.min(selectedIndex, n - 1);
  const currentStory = stories[safeIndex];
  const isAfterRefinement = previousStories.length > 0;
  const isNew = isAfterRefinement && !changedFieldsById.has(currentStory?.id ?? "");

  // Count changed / new stories for sidebar footer
  const changedCount = [...changedFieldsById.values()].filter((f) => f.size > 0).length;
  const newCount = isAfterRefinement
    ? storeStories.filter((s) => !changedFieldsById.has(s.id)).length
    : 0;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Left: story list ─────────────────────────────────────────────── */}
      <StoryListSidebar
        stories={stories}
        selectedIndex={safeIndex}
        onSelect={setSelectedIndex}
        changedFieldsById={changedFieldsById}
        isAfterRefinement={isAfterRefinement}
        header={
          <div>
            <p className="text-text-primary font-semibold text-sm">
              Stories
              <span className="ml-1.5 text-text-muted font-normal">({n})</span>
            </p>
            {isAfterRefinement && (changedCount > 0 || newCount > 0) && (
              <p className="text-text-muted text-xs mt-1">
                {changedCount > 0 && (
                  <span className="inline-flex items-center gap-1 mr-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    {changedCount} changed
                  </span>
                )}
                {newCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-green-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    {newCount} new
                  </span>
                )}
              </p>
            )}
          </div>
        }
        footer={
          <p className="text-text-muted text-xs">
            Story {safeIndex + 1} of {n}
          </p>
        }
      />

      {/* ── Right: story detail + actions ────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Navigation bar */}
        <div className="shrink-0 border-b border-surface-border px-6 py-3 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary leading-none">
              Review User Stories
            </h2>
            <p className="text-text-muted text-xs mt-0.5">
              Edit inline, then approve or request AI refinement.
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
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
        </div>

        {/* Story card */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {currentStory && (
            <StoryCard
              key={currentStory.id}
              story={currentStory}
              onChange={(updated) => updateStory(safeIndex, updated)}
              onDelete={() => deleteStory(safeIndex)}
              changedFields={changedFieldsById.get(currentStory.id)}
              isNew={isNew}
            />
          )}
        </div>

        {/* Footer actions */}
        <div className="shrink-0 border-t border-surface-border px-6 py-4 space-y-3 bg-surface-card">
          <div>
            <label className="text-text-muted text-xs font-medium uppercase tracking-wider block mb-1.5">
              Refinement Feedback (optional — applies to all stories)
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={2}
              placeholder="Describe what you'd like changed across the stories…"
              className="w-full rounded-lg bg-surface border border-surface-border px-3 py-2 text-text-secondary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleRefinement}
              disabled={!feedback.trim() || isSubmitting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-border text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Request Refinement
            </button>

            <button
              onClick={handleApprove}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors text-sm"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Approve & Export
            </button>

            {isSubmitting && (
              <p className="text-status-processing text-xs animate-pulse">Submitting…</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
