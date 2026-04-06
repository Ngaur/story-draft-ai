import { create } from "zustand";
import type {
  ActiveSession,
  ClarificationAnswer,
  ClarifyingQuestion,
  ConceptNode,
  JiraCreationRequest,
  JiraCreationResponse,
  SessionDetail,
  StatusPayload,
  UserStory,
  WorkflowStatus,
} from "@/types";
import {
  createJiraTickets,
  getArtifactUrl,
  startSession,
  submitClarification,
  submitStoryReview,
} from "@/api/chat";

interface SessionStore {
  // Active workflow session
  session: ActiveSession | null;
  conceptNodes: ConceptNode[];
  clarifyingQuestions: ClarifyingQuestion[];
  stories: UserStory[];
  artifactPath: string | null;
  errorMessage: string | null;

  // Past session currently being viewed (sidebar navigation)
  viewingSession: SessionDetail | null;

  // Loading flags
  isSubmitting: boolean;

  // Actions
  startNewSession: (file: File) => Promise<void>;
  applyStatusPoll: (payload: StatusPayload) => void;
  submitClarificationAnswers: (answers: ClarificationAnswer[]) => Promise<void>;
  submitReview: (stories: UserStory[], feedback: string) => Promise<void>;
  downloadArtifact: () => void;
  createTickets: (request: JiraCreationRequest) => Promise<JiraCreationResponse>;
  setViewingSession: (session: SessionDetail | null) => void;
  reset: () => void;
}

const INITIAL: Pick<
  SessionStore,
  | "session"
  | "conceptNodes"
  | "clarifyingQuestions"
  | "stories"
  | "artifactPath"
  | "errorMessage"
  | "viewingSession"
  | "isSubmitting"
> = {
  session: null,
  conceptNodes: [],
  clarifyingQuestions: [],
  stories: [],
  artifactPath: null,
  errorMessage: null,
  viewingSession: null,
  isSubmitting: false,
};

export const useSessionStore = create<SessionStore>((set, get) => ({
  ...INITIAL,

  startNewSession: async (file) => {
    set({ ...INITIAL, isSubmitting: true });
    const session = await startSession(file);
    set({ session, isSubmitting: false });
  },

  applyStatusPoll: (payload) => {
    set((s) => ({
      session: s.session
        ? { ...s.session, status: payload.status as WorkflowStatus }
        : null,
      conceptNodes: payload.concept_nodes ?? s.conceptNodes,
      clarifyingQuestions: payload.clarifying_questions ?? s.clarifyingQuestions,
      stories: payload.stories ?? s.stories,
      artifactPath: payload.artifact_path ?? s.artifactPath,
      errorMessage: payload.error_message ?? s.errorMessage,
    }));
  },

  submitClarificationAnswers: async (answers) => {
    const { session } = get();
    if (!session) return;
    set({ isSubmitting: true });
    await submitClarification(session.threadId, answers);
    set((s) => ({
      isSubmitting: false,
      session: s.session ? { ...s.session, status: "processing" } : null,
    }));
  },

  submitReview: async (stories, feedback) => {
    const { session } = get();
    if (!session) return;
    set({ isSubmitting: true });
    await submitStoryReview(session.threadId, stories, feedback);
    set((s) => ({
      isSubmitting: false,
      session: s.session ? { ...s.session, status: "processing" } : null,
    }));
  },

  downloadArtifact: () => {
    const { session } = get();
    if (!session) return;
    const url = getArtifactUrl(session.sessionId);
    const a = document.createElement("a");
    a.href = url;
    a.download = "user_stories.docx";
    a.click();
  },

  createTickets: async (request) => {
    const { session } = get();
    if (!session) throw new Error("No active session");
    return createJiraTickets(session.sessionId, request);
  },

  setViewingSession: (viewingSession) => set({ viewingSession }),

  reset: () => set(INITIAL),
}));
