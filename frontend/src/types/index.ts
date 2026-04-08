export type WorkflowStatus =
  | "processing"
  | "awaiting_clarification"
  | "awaiting_review"
  | "complete"
  | "error";

export interface ConceptNode {
  id: string;
  title: string;
  description: string;
}

export interface ClarifyingQuestion {
  concept_id: string;
  question_text: string;
  question_type: "open" | "yes_no" | "multiple_choice" | "multiple_select";
  options?: string[];
}

export interface ClarificationAnswer {
  concept_id: string;
  question_text: string;
  answer: string;
}

export interface UserStory {
  id: string;
  concept_id: string;

  // Section 1
  epic_title: string;
  title: string;

  // Section 2
  role: string;
  want: string;
  benefit: string;

  // Section 3
  detailed_description: string;

  // Section 4
  pre_conditions: string[];

  // Section 5
  post_conditions: string[];

  // Section 6
  data_governance: string[];

  // Section 7
  acceptance_criteria: string[];

  // Section 8
  assumptions: string[];

  // Section 9
  assertions: string[];

  // Section 10
  edge_cases: string[];

  // Section 11
  dependencies: string[];

  // Section 12
  example_data: string[];

  // Section 13
  test_scenarios: string[];

  // Section 14
  definition_of_done: string[];

  // Metadata
  story_points_estimate: number;
  priority: "High" | "Medium" | "Low";

  // Populated by the LLM only after a refinement pass; null on initial draft
  change_summary?: string | null;
}

export interface ActiveSession {
  sessionId: string;
  threadId: string;
  filename: string;
  status: WorkflowStatus;
}

export interface StatusPayload {
  thread_id: string;
  session_id: string;
  status: WorkflowStatus;
  concept_nodes?: ConceptNode[];
  clarifying_questions?: ClarifyingQuestion[];
  stories?: UserStory[];
  artifact_path?: string;
  error_message?: string;
}

export interface SessionRecord {
  session_id: string;
  thread_id: string;
  filename: string;
  created_at: string;
  updated_at: string;
  status: WorkflowStatus;
  has_artifacts: boolean;
}

export interface SessionDetail extends SessionRecord {
  stories: UserStory[];
}

export interface JiraCreationRequest {
  jira_url: string;
  project_key: string;
  email: string;
  api_token: string;
  story_ids: string[];
}

export interface JiraIssueResult {
  story_id: string;
  issue_key?: string;
  issue_url?: string;
  error?: string;
}

export interface JiraCreationResponse {
  created_issues: JiraIssueResult[];
  failed_issues: JiraIssueResult[];
}
