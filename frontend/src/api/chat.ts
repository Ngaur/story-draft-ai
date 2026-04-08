import { apiClient } from "./client";
import type {
  ActiveSession,
  ClarificationAnswer,
  JiraCreationRequest,
  JiraCreationResponse,
  StatusPayload,
  UserStory,
} from "@/types";

export async function startSession(
  file: File,
  supportingFiles?: File[]
): Promise<ActiveSession> {
  const form = new FormData();
  form.append("file", file);
  for (const sf of supportingFiles ?? []) {
    form.append("supporting_files", sf);
  }
  const { data } = await apiClient.post<{
    session_id: string;
    thread_id: string;
    filename: string;
    status: string;
  }>("/chat/start", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return {
    sessionId: data.session_id,
    threadId: data.thread_id,
    filename: file.name,
    status: "processing",
  };
}

export async function getStatus(threadId: string): Promise<StatusPayload> {
  const { data } = await apiClient.get<StatusPayload>(`/chat/status/${threadId}`);
  return data;
}

export async function submitClarification(
  threadId: string,
  answers: ClarificationAnswer[]
): Promise<void> {
  await apiClient.post(`/chat/review/clarification/${threadId}`, { answers });
}

export async function submitStoryReview(
  threadId: string,
  stories: UserStory[],
  refinementFeedback: string
): Promise<void> {
  await apiClient.post(`/chat/review/stories/${threadId}`, {
    stories,
    refinement_feedback: refinementFeedback,
  });
}

export function getArtifactUrl(sessionId: string): string {
  const base = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
  return `${base}/api/v1/chat/artifact/${sessionId}`;
}

export async function createJiraTickets(
  sessionId: string,
  request: JiraCreationRequest
): Promise<JiraCreationResponse> {
  const { data } = await apiClient.post<JiraCreationResponse>(
    `/chat/jira/${sessionId}`,
    request
  );
  return data;
}
