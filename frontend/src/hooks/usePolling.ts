import { useEffect } from "react";
import { getStatus } from "@/api/chat";
import { useSessionStore } from "@/store/session";

const POLL_INTERVAL_MS = 2500;
const TERMINAL_STATUSES = new Set(["awaiting_clarification", "awaiting_review", "complete", "error"]);

/**
 * Polls GET /chat/status/{threadId} every 2500ms while:
 * - threadId is defined
 * - session status is "processing" (not yet at an interrupt or terminal state)
 *
 * On each response, updates the Zustand store via applyStatusPoll.
 * Silently ignores 404s (graph not yet checkpointed).
 */
export function usePolling(threadId: string | null | undefined): void {
  const applyStatusPoll = useSessionStore((s) => s.applyStatusPoll);
  const status = useSessionStore((s) => s.session?.status);

  useEffect(() => {
    if (!threadId) return;
    if (status && TERMINAL_STATUSES.has(status)) return;

    const id = setInterval(async () => {
      try {
        const payload = await getStatus(threadId);
        applyStatusPoll(payload);
      } catch {
        // 404 = graph not yet initialised; ignore silently
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [threadId, status, applyStatusPoll]);
}
