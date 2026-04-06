import { useSessionStore } from "@/store/session";
import { usePolling } from "@/hooks/usePolling";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { UploadScreen } from "@/components/UploadScreen/UploadScreen";
import { ProcessingScreen } from "@/components/ProcessingScreen/ProcessingScreen";
import { ClarificationPanel } from "@/components/ClarificationPanel/ClarificationPanel";
import { StoryReviewPanel } from "@/components/StoryReviewPanel/StoryReviewPanel";
import { ExportPanel } from "@/components/ExportPanel/ExportPanel";
import { SessionViewer } from "@/components/SessionViewer/SessionViewer";
import { AlertCircle } from "lucide-react";

export function Home() {
  const session = useSessionStore((s) => s.session);
  const viewingSession = useSessionStore((s) => s.viewingSession);
  const errorMessage = useSessionStore((s) => s.errorMessage);

  // Poll while the graph is actively running
  usePolling(session?.threadId);

  function renderMain() {
    // Priority: past session viewer overrides everything
    if (viewingSession) {
      return <SessionViewer session={viewingSession} />;
    }

    if (!session) {
      return <UploadScreen />;
    }

    switch (session.status) {
      case "processing":
        return <ProcessingScreen />;
      case "awaiting_clarification":
        return <ClarificationPanel />;
      case "awaiting_review":
        return <StoryReviewPanel />;
      case "complete":
        return <ExportPanel />;
      case "error":
        return (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8">
            <AlertCircle className="h-10 w-10 text-status-error" />
            <div className="text-center">
              <p className="text-text-primary font-medium">Something went wrong</p>
              <p className="text-text-secondary text-sm mt-1 max-w-sm">
                {errorMessage ?? "An unexpected error occurred. Please try again."}
              </p>
            </div>
          </div>
        );
      default:
        return <UploadScreen />;
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface text-text-primary">
      <Sidebar />
      <main className="flex flex-1 overflow-hidden">{renderMain()}</main>
    </div>
  );
}
