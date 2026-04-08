import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { BookOpen, FileText, MessageSquareText, Sparkles, Upload, X, Zap } from "lucide-react";
import { useSessionStore } from "@/store/session";

const FEATURES = [
  { icon: FileText, label: "Extracts concept nodes from PDF & DOCX" },
  { icon: MessageSquareText, label: "Generates targeted clarifying questions" },
  { icon: Zap, label: "Exports INVEST-compliant stories + Jira tickets" },
];

const ACCEPT = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};

const MAX_SUPPORTING = 5;

export function UploadScreen() {
  const startNewSession = useSessionStore((s) => s.startNewSession);
  const isSubmitting    = useSessionStore((s) => s.isSubmitting);

  const [primaryFile,     setPrimaryFile]     = useState<File | null>(null);
  const [supportingFiles, setSupportingFiles] = useState<File[]>([]);
  const [error,           setError]           = useState<string | null>(null);

  const onDropPrimary = useCallback((accepted: File[]) => {
    if (accepted.length) setPrimaryFile(accepted[0]);
  }, []);

  const onDropSupporting = useCallback((accepted: File[]) => {
    setSupportingFiles((prev) => [...prev, ...accepted].slice(0, MAX_SUPPORTING));
  }, []);

  const primaryDropzone = useDropzone({
    onDrop: onDropPrimary,
    accept: ACCEPT,
    maxFiles: 1,
    disabled: isSubmitting,
  });

  const supportingDropzone = useDropzone({
    onDrop: onDropSupporting,
    accept: ACCEPT,
    multiple: true,
    disabled: isSubmitting || supportingFiles.length >= MAX_SUPPORTING,
  });

  function removeSupporting(index: number) {
    setSupportingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!primaryFile) return;
    setError(null);
    try {
      await startNewSession(primaryFile, supportingFiles.length > 0 ? supportingFiles : undefined);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  }

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

      {/* Upload zones */}
      <div className="w-full max-w-lg flex flex-col gap-4">
        {/* Primary drop zone */}
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
            Product Requirement Document <span className="text-status-error">*</span>
          </p>
          {primaryFile ? (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-accent/30 bg-accent/5">
              <FileText className="h-4 w-4 text-accent shrink-0" />
              <span className="text-sm text-text-primary flex-1 truncate">{primaryFile.name}</span>
              {!isSubmitting && (
                <button
                  onClick={() => setPrimaryFile(null)}
                  className="text-text-muted hover:text-status-error transition-colors"
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : (
            <div
              {...primaryDropzone.getRootProps()}
              className={[
                "rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200",
                primaryDropzone.isDragActive
                  ? "border-accent bg-accent/8 scale-[1.01]"
                  : "border-surface-border bg-surface-card hover:border-accent/50 hover:bg-accent/5 hover:shadow-md",
                isSubmitting ? "opacity-60 cursor-not-allowed" : "",
              ].join(" ")}
            >
              <input {...primaryDropzone.getInputProps()} />
              <div className="flex flex-col items-center gap-3">
                <div className={[
                  "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200",
                  primaryDropzone.isDragActive ? "bg-accent/15" : "bg-surface-hover",
                ].join(" ")}>
                  {primaryDropzone.isDragActive
                    ? <Upload className="h-6 w-6 text-accent" />
                    : <FileText className="h-6 w-6 text-text-muted" />
                  }
                </div>
                <div>
                  <p className="text-text-primary font-semibold text-sm">
                    {primaryDropzone.isDragActive ? "Drop your file here" : "Drag & drop your PRD"}
                  </p>
                  <p className="text-text-secondary text-xs mt-0.5">PDF or DOCX · up to 20 MB</p>
                </div>
                <button className="px-4 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors shadow-sm">
                  Browse files
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Supporting documents */}
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
            Supporting Documents
            <span className="ml-1.5 text-text-muted font-normal normal-case tracking-normal">
              (optional · up to {MAX_SUPPORTING} — tech specs, design docs, glossary…)
            </span>
          </p>

          {/* Selected files list */}
          {supportingFiles.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-2">
              {supportingFiles.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-surface-border bg-surface-hover"
                >
                  <BookOpen className="h-3.5 w-3.5 text-text-muted shrink-0" />
                  <span className="text-sm text-text-secondary flex-1 truncate">{f.name}</span>
                  {!isSubmitting && (
                    <button
                      onClick={() => removeSupporting(i)}
                      className="text-text-muted hover:text-status-error transition-colors"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Drop zone — hidden when cap reached */}
          {supportingFiles.length < MAX_SUPPORTING && (
            <div
              {...supportingDropzone.getRootProps()}
              className={[
                "rounded-xl border border-dashed px-6 py-4 text-center cursor-pointer transition-all duration-200",
                supportingDropzone.isDragActive
                  ? "border-accent/60 bg-accent/5"
                  : "border-surface-border bg-surface-hover/50 hover:border-accent/30 hover:bg-accent/3",
                isSubmitting ? "opacity-60 cursor-not-allowed" : "",
              ].join(" ")}
            >
              <input {...supportingDropzone.getInputProps()} />
              <div className="flex items-center justify-center gap-3">
                <BookOpen className={[
                  "h-4 w-4 shrink-0",
                  supportingDropzone.isDragActive ? "text-accent" : "text-text-muted",
                ].join(" ")} />
                <p className="text-text-secondary text-sm">
                  {supportingDropzone.isDragActive
                    ? "Drop files here"
                    : supportingFiles.length === 0
                      ? "Drop supporting documents or click to browse"
                      : `Add more (${MAX_SUPPORTING - supportingFiles.length} remaining)`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={!primaryFile || isSubmitting}
          className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors shadow-sm"
        >
          {isSubmitting ? (
            <span className="animate-pulse">Uploading…</span>
          ) : (
            "Start"
          )}
        </button>
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
