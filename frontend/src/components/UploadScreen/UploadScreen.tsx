import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { FileText, MessageSquareText, Sparkles, Upload, Zap } from "lucide-react";
import { useSessionStore } from "@/store/session";

const FEATURES = [
  { icon: FileText, label: "Extracts concept nodes from PDF & DOCX" },
  { icon: MessageSquareText, label: "Generates targeted clarifying questions" },
  { icon: Zap, label: "Exports INVEST-compliant stories + Jira tickets" },
];

export function UploadScreen() {
  const startNewSession = useSessionStore((s) => s.startNewSession);
  const isSubmitting = useSessionStore((s) => s.isSubmitting);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (accepted: File[]) => {
      if (!accepted.length) return;
      setError(null);
      try {
        await startNewSession(accepted[0]);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    },
    [startNewSession]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    maxFiles: 1,
    disabled: isSubmitting,
  });

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-8">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2.5 mb-3">
          <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">story-draft-ai</h1>
        </div>
        <p className="text-text-secondary max-w-sm">
          Turn your product requirements into implementation-ready Jira user stories in minutes.
        </p>
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={[
          "w-full max-w-lg rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-200",
          isDragActive
            ? "border-accent bg-accent/8 scale-[1.01]"
            : "border-surface-border bg-surface-card hover:border-accent/50 hover:bg-accent/5 hover:shadow-md",
          isSubmitting ? "opacity-60 cursor-not-allowed" : "",
        ].join(" ")}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-4">
          <div className={[
            "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200",
            isDragActive ? "bg-accent/15" : "bg-surface-hover",
          ].join(" ")}>
            {isDragActive ? (
              <Upload className="h-7 w-7 text-accent" />
            ) : (
              <FileText className="h-7 w-7 text-text-muted" />
            )}
          </div>
          <div>
            <p className="text-text-primary font-semibold">
              {isDragActive ? "Drop your file here" : "Drag & drop your document"}
            </p>
            <p className="text-text-secondary text-sm mt-1">PDF or DOCX · up to 20 MB</p>
          </div>
          {!isSubmitting && (
            <button className="px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors shadow-sm">
              Browse files
            </button>
          )}
          {isSubmitting && (
            <p className="text-accent text-sm font-medium animate-pulse">Uploading…</p>
          )}
        </div>
      </div>

      {/* Feature hints */}
      <div className="flex flex-col sm:flex-row items-center gap-4 text-sm">
        {FEATURES.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2 text-text-muted">
            <Icon className="h-4 w-4 text-accent/70 shrink-0" />
            <span>{label}</span>
          </div>
        ))}
      </div>

      {error && (
        <p className="text-status-error text-sm bg-red-50 border border-red-100 rounded-lg px-4 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
