import type { UserStory } from "@/types";

const PRIORITY_DOT: Record<UserStory["priority"], string> = {
  High:   "bg-priority-high",
  Medium: "bg-priority-medium",
  Low:    "bg-priority-low",
};

const PRIORITY_LABEL: Record<UserStory["priority"], string> = {
  High:   "H",
  Medium: "M",
  Low:    "L",
};

interface StoryListSidebarProps {
  stories: UserStory[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** Pass the per-story diff map from StoryReviewPanel to show changed/new indicators. */
  changedFieldsById?: Map<string, Set<string>>;
  /** True once a refinement round has completed — used to detect new stories. */
  isAfterRefinement?: boolean;
  /** Content rendered in the sidebar header (e.g. story count, filter). */
  header?: React.ReactNode;
  /** Content rendered in the sidebar footer (e.g. progress). */
  footer?: React.ReactNode;
}

export function StoryListSidebar({
  stories,
  selectedIndex,
  onSelect,
  changedFieldsById,
  isAfterRefinement = false,
  header,
  footer,
}: StoryListSidebarProps) {
  return (
    <div className="w-72 shrink-0 border-r border-surface-border flex flex-col bg-[#eef2f7] overflow-hidden">
      {header && (
        <div className="px-4 py-3 border-b border-surface-border shrink-0">
          {header}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {stories.map((story, i) => {
          const changedFields = changedFieldsById?.get(story.id);
          const isChanged = !!changedFields && changedFields.size > 0;
          const isNew =
            isAfterRefinement && !!changedFieldsById && !changedFieldsById.has(story.id);
          const isSelected = selectedIndex === i;

          return (
            <button
              key={story.id}
              onClick={() => onSelect(i)}
              className={[
                "w-full text-left px-4 py-3 border-l-2 transition-all duration-150",
                isSelected
                  ? "border-l-accent bg-white"
                  : "border-l-transparent hover:bg-surface-hover",
              ].join(" ")}
            >
              {/* Row 1: priority dot + points + indicators */}
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${PRIORITY_DOT[story.priority]}`}
                  title={story.priority}
                />
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">
                  {PRIORITY_LABEL[story.priority]}
                </span>
                <span className="text-xs text-text-muted">{story.story_points_estimate}pt</span>
                <div className="ml-auto flex items-center gap-1.5">
                  {isNew && (
                    <span className="text-[10px] font-bold text-green-700 bg-green-100 border border-green-200 rounded px-1.5 leading-4">
                      NEW
                    </span>
                  )}
                  {isChanged && (
                    <span
                      className="h-2 w-2 rounded-full bg-amber-400 shrink-0"
                      title="Changed in last refinement"
                    />
                  )}
                </div>
              </div>

              {/* Row 2: title */}
              <p
                className={`text-sm font-medium leading-snug line-clamp-2 ${
                  isSelected ? "text-accent" : "text-text-primary"
                }`}
              >
                {story.title}
              </p>

              {/* Row 3: epic */}
              {story.epic_title && (
                <p className="text-xs text-text-muted mt-0.5 truncate">{story.epic_title}</p>
              )}
            </button>
          );
        })}
      </div>

      {footer && (
        <div className="shrink-0 border-t border-surface-border px-4 py-3">
          {footer}
        </div>
      )}
    </div>
  );
}
