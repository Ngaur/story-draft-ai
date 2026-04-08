import { apiClient } from "./client";
import type { SessionDetail, SessionRecord } from "@/types";

export async function listSessions(): Promise<SessionRecord[]> {
  const { data } = await apiClient.get<SessionRecord[]>("/sessions");
  return data;
}

export async function getSession(sessionId: string): Promise<SessionDetail> {
  const { data } = await apiClient.get<SessionDetail>(`/sessions/${sessionId}`);
  return data;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await apiClient.delete(`/sessions/${sessionId}`);
}
