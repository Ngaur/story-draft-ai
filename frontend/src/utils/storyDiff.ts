import type { UserStory } from "@/types";

// Maps every UserStory content field to the exact Section label used in StoryCard.tsx.
// "header" = always-visible card header area (not a collapsible Section).
export const FIELD_TO_SECTION: Record<string, string> = {
  epic_title:            "header",
  title:                 "header",
  role:                  "header",
  want:                  "header",
  benefit:               "header",
  story_points_estimate: "header",
  priority:              "header",
  detailed_description:  "Detailed Description",
  pre_conditions:        "Pre-Conditions & Post-Conditions",
  post_conditions:       "Pre-Conditions & Post-Conditions",
  data_governance:       "Data Governance",
  acceptance_criteria:   "Acceptance Criteria",
  assumptions:           "Assumptions & Assertions",
  assertions:            "Assumptions & Assertions",
  edge_cases:            "Edge Cases & Error Scenarios",
  dependencies:          "Dependencies",
  example_data:          "Example Data & Test Scenarios",
  test_scenarios:        "Example Data & Test Scenarios",
  definition_of_done:    "Definition of Done",
};

/**
 * Returns the set of field keys that differ between two story versions.
 * Excludes id, concept_id, change_summary (metadata, not content).
 * Arrays are compared by JSON.stringify — order-sensitive because
 * any reordering by the LLM is a meaningful change.
 */
export function computeChangedFields(
  before: UserStory,
  after: UserStory,
): Set<string> {
  const EXCLUDED = new Set(["id", "concept_id", "change_summary"]);
  const changed = new Set<string>();
  for (const key of Object.keys(FIELD_TO_SECTION)) {
    if (EXCLUDED.has(key)) continue;
    const b = (before as Record<string, unknown>)[key];
    const a = (after  as Record<string, unknown>)[key];
    const differs =
      Array.isArray(b) || Array.isArray(a)
        ? JSON.stringify(b) !== JSON.stringify(a)
        : b !== a;
    if (differs) changed.add(key);
  }
  return changed;
}

/**
 * Returns the set of Section label strings that contain at least one changed field.
 * "header" is excluded — the StoryCard caller handles the header area separately.
 */
export function changedSections(changedFields: Set<string>): Set<string> {
  const sections = new Set<string>();
  for (const field of changedFields) {
    const section = FIELD_TO_SECTION[field];
    if (section && section !== "header") sections.add(section);
  }
  return sections;
}
