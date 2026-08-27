import { useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  BadgeCheck,
  Brain,
  CheckCircle2,
  FileText,
  FlaskConical,
  GraduationCap,
  Loader2,
  RotateCw,
  Sparkles,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Panel, EmptyState, Badge } from "@/components/worklens/Panel";
import { getResume, uploadResume, analyzeResume, type ResumeView } from "@/lib/resume-fns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/resume")({
  head: () => ({
    meta: [
      { title: "Resume Intelligence — WorkLens" },
      {
        name: "description",
        content:
          "Upload a PDF or DOCX resume and let WorkLens's AI extract your academic profile, skills, projects and career signals.",
      },
    ],
  }),
  loader: (): Promise<ResumeView> => getResume(),
  component: ResumePage,
});

type ClientState = "idle" | "uploading" | "analyzing";

const CONFIDENCE_TONE = (n: number | null | undefined) =>
  n == null ? "muted" : n >= 75 ? "success" : n >= 50 ? "primary" : "warning";

const EVIDENCE_LABEL: Record<string, string> = {
  claimed: "Claimed",
  supported_by_resume: "Supported by resume",
  assessed: "Assessed",
  project_verified: "Project-verified",
};

function ResumePage() {
  const view = Route.useLoaderData();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [clientState, setClientState] = useState<ClientState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const serverStatus = view.resume?.status ?? null;

  const analyze = useMutation({
    mutationFn: (resumeId: string) => analyzeResume({ data: { resumeId } }),
    onSuccess: async () => {
      setClientState("idle");
      setErrorMessage(null);
      await router.invalidate();
      toast.success("Resume analyzed");
    },
    onError: async (err: Error) => {
      setClientState("idle");
      setErrorMessage(err.message || "The analysis failed. Please try again.");
      await router.invalidate();
    },
  });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return uploadResume({ data: fd });
    },
    onSuccess: ({ resumeId }) => {
      setClientState("analyzing");
      analyze.mutate(resumeId);
    },
    onError: (err: Error) => {
      setClientState("idle");
      setErrorMessage(err.message || "Couldn't process that file.");
    },
  });

  function handleFile(file: File | undefined) {
    if (!file) return;
    setErrorMessage(null);
    setClientState("uploading");
    upload.mutate(file);
  }

  // If the user reloads while the server row is mid-pipeline, offer to resume.
  const stuck = serverStatus === "processing" || serverStatus === "analyzing";
  useEffect(() => {
    if (stuck && clientState === "idle" && view.resume && !analyze.isPending) {
      setClientState("analyzing");
      analyze.mutate(view.resume.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = clientState !== "idle" || analyze.isPending || upload.isPending;
  const phase: ProcessingPhase | null = upload.isPending
    ? "uploading"
    : clientState === "analyzing" || analyze.isPending
      ? "analyzing"
      : stuck
        ? "processing"
        : null;

  return (
    <div className="space-y-6">
      <Panel
        title="Upload résumé"
        description="PDF or DOCX, up to 5 MB. Your file is private to your account and never shared."
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            if (!busy) handleFile(e.dataTransfer.files[0]);
          }}
          onClick={() => !busy && inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center rounded-lg border border-dashed px-6 py-12 text-center transition-colors",
            dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
            busy && "pointer-events-none opacity-60",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <UploadCloud className="size-6 text-primary" />
          <p className="mt-3 text-sm font-medium">
            {busy ? "Working on it…" : "Drag and drop your résumé, or click to browse"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">PDF or DOCX — up to 5 MB.</p>
        </div>

        {phase && <ProcessingStrip phase={phase} />}

        {errorMessage && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="flex-1">
              <p className="font-medium text-destructive">Analysis failed</p>
              <p className="mt-0.5 text-muted-foreground">{errorMessage}</p>
            </div>
            {view.resume && (
              <button
                onClick={() => {
                  setErrorMessage(null);
                  setClientState("analyzing");
                  analyze.mutate(view.resume!.id);
                }}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                <RotateCw className="size-3.5" /> Retry
              </button>
            )}
          </div>
        )}
      </Panel>

      {view.resume && !phase && serverStatus === "failed" && !errorMessage && (
        <Panel title="Last analysis failed">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {view.resume.errorMessage ?? "Something went wrong analyzing your résumé."}
            </p>
            <button
              onClick={() => {
                setClientState("analyzing");
                analyze.mutate(view.resume!.id);
              }}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <RotateCw className="size-4" /> Retry analysis
            </button>
          </div>
        </Panel>
      )}

      {view.resume && view.analysis ? (
        <Results view={view} />
      ) : (
        !phase &&
        serverStatus !== "failed" && (
          <Panel title="What you'll get">
            <EmptyState
              icon={<Brain className="size-6" />}
              title="No résumé analyzed yet"
              description="Upload a résumé and WorkLens will extract your academic profile, evidence-backed skills, projects, experience and the career paths your résumé points toward."
            />
          </Panel>
        )
      )}
    </div>
  );
}

type ProcessingPhase = "uploading" | "processing" | "analyzing";

function ProcessingStrip({ phase }: { phase: ProcessingPhase }) {
  const steps: { key: ProcessingPhase | "complete"; label: string }[] = [
    { key: "uploading", label: "Uploading" },
    { key: "processing", label: "Extracting text" },
    { key: "analyzing", label: "Analyzing with AI" },
    { key: "complete", label: "Done" },
  ];
  const activeIndex = steps.findIndex((s) => s.key === phase);

  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Loader2 className="size-4 animate-spin text-primary" />
        {steps[activeIndex]?.label}…
      </div>
      <div className="mt-3 flex gap-1.5">
        {steps.slice(0, 3).map((s, i) => (
          <div
            key={s.key}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i < activeIndex ? "bg-primary" : i === activeIndex ? "bg-primary/50" : "bg-muted",
            )}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        AI analysis can take up to a minute. You can leave this page — it keeps running.
      </p>
    </div>
  );
}

// --- results ------------------------------------------------------------

function Results({ view }: { view: ResumeView }) {
  if (!view.resume || !view.analysis) return null;
  const { analysis, resume, discrepancies } = view;
  const d = analysis.detected;

  const skillsByKind = groupBy(analysis.skills, (s) => s.kind);
  const kindOrder = ["language", "framework", "tool", "database", "cloud", "concept", "other"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="size-4 text-primary" />
          <span className="font-medium text-foreground">{resume.fileName}</span>
          <Badge tone="success">
            <CheckCircle2 className="mr-1 inline size-3" /> Analyzed
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {resume.analysisModel} ·{" "}
          {resume.analyzedAt && new Date(resume.analyzedAt).toLocaleString()}
        </span>
      </div>

      {analysis.summary && (
        <Panel title="Summary">
          <p className="text-sm leading-relaxed text-muted-foreground">{analysis.summary}</p>
        </Panel>
      )}

      {discrepancies.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-warning">
            <AlertTriangle className="size-4" /> Your profile and your résumé don't fully match
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            We haven't changed anything. Review these and update your profile only if you want to.
          </p>
          <ul className="mt-3 space-y-2">
            {discrepancies.map((x) => (
              <li key={x.field} className="rounded-lg border border-border bg-card p-3 text-sm">
                <p className="font-medium">{x.label}</p>
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  <span className="text-muted-foreground">
                    You declared: <span className="text-foreground">{x.declared ?? "—"}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Résumé suggests: <span className="text-foreground">{x.detected ?? "—"}</span>
                    {x.detectedConfidence != null && (
                      <span className="ml-1 text-xs">({x.detectedConfidence}% confidence)</span>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Panel
        title="Academic profile"
        description="AI-detected from your résumé — not applied to your profile."
      >
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Detected label="Name" value={d.name} />
          <Detected label="Degree" value={d.degree} />
          <Detected label="College / university" value={d.college} />
          <Detected label="Graduation year" value={d.graduationYear} />
          <Detected
            label="Engineering branch"
            value={d.branchLabel}
            confidence={d.branchConfidence}
          />
          <Detected
            label="Specialization"
            value={d.specialization}
            confidence={d.specializationConfidence}
          />
          <Detected
            label="Experience level"
            value={d.experienceLabel}
            confidence={d.experienceConfidence}
          />
        </dl>
      </Panel>

      <Panel
        title="Detected skills"
        description="Evidence level shown per skill. A résumé mention alone is never “verified”."
      >
        {analysis.skills.length === 0 ? (
          <EmptyState
            title="No skills detected"
            description="Add concrete technologies, tools and projects to your résumé."
          />
        ) : (
          <div className="space-y-4">
            {kindOrder
              .filter((k) => skillsByKind.get(k)?.length)
              .map((k) => (
                <div key={k}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {k === "concept" ? "Concepts" : `${k}s`}
                  </p>
                  <div className="space-y-1.5">
                    {skillsByKind.get(k)!.map((s) => (
                      <div
                        key={s.name}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                      >
                        <span className="font-medium">{s.name}</span>
                        {!s.inCatalog && (
                          <span className="text-xs text-muted-foreground">(not in catalog)</span>
                        )}
                        <Badge
                          tone={s.evidenceType === "supported_by_resume" ? "success" : "muted"}
                        >
                          {s.evidenceType === "supported_by_resume" ? (
                            <BadgeCheck className="mr-1 inline size-3" />
                          ) : null}
                          {EVIDENCE_LABEL[s.evidenceType] ?? s.evidenceType}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{s.confidence}%</span>
                        {s.evidence.length > 0 && (
                          <span className="w-full text-xs text-muted-foreground">
                            {s.evidence.map((e) => e.label).join(" · ")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </Panel>

      {analysis.projects.length > 0 && (
        <Panel title="Projects">
          <ul className="space-y-3">
            {analysis.projects.map((p, i) => (
              <li key={i} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{p.title}</p>
                  {p.domain && <Badge tone="primary">{p.domain}</Badge>}
                </div>
                {p.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                )}
                {p.technologies.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.technologies.map((t) => (
                      <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {(analysis.internships.length > 0 || analysis.workExperience.length > 0) && (
        <Panel title="Experience">
          <ul className="space-y-3">
            {[...analysis.internships, ...analysis.workExperience].map((e, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <GraduationCap className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="font-medium">
                    {e.role ? `${e.role} · ` : ""}
                    {e.organization}
                    <Badge tone="muted">{e.kind === "internship" ? "Internship" : "Work"}</Badge>
                  </p>
                  {(e.startDate || e.endDate) && (
                    <p className="text-xs text-muted-foreground">
                      {[e.startDate, e.endDate].filter(Boolean).join(" – ")}
                    </p>
                  )}
                  {e.summary && <p className="mt-0.5 text-muted-foreground">{e.summary}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {(analysis.certifications.length > 0 || analysis.achievements.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {analysis.certifications.length > 0 && (
            <Panel title="Certifications">
              <ul className="space-y-1.5 text-sm">
                {analysis.certifications.map((c, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <BadgeCheck className="size-4 text-primary" />
                    {c.name}
                    {c.issuer && (
                      <span className="text-xs text-muted-foreground">· {c.issuer}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {analysis.achievements.length > 0 && (
            <Panel title="Achievements">
              <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {analysis.achievements.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}

      <Panel
        title="Career signals"
        description="Suggestions from your résumé — not a verdict on what you can do."
      >
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
          These are <span className="font-medium text-foreground">recommendations</span>, not
          classifications. A low score means your résumé shows less evidence for that path yet — not
          that it's closed to you.
        </div>
        {analysis.careerSignals.length === 0 ? (
          <EmptyState
            title="No clear career signals"
            description="Add projects and internships for sharper suggestions."
          />
        ) : (
          <ul className="space-y-2">
            {analysis.careerSignals.map((c) => (
              <li key={c.title} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{c.title}</span>
                  <span className={cn("text-sm font-semibold", scoreColor(c.score))}>
                    {c.score}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${c.score}%` }}
                  />
                </div>
                {c.rationale && (
                  <p className="mt-1.5 text-xs text-muted-foreground">{c.rationale}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {analysis.projectDomains.length > 0 && (
        <Panel title="Project domains">
          <div className="flex flex-wrap gap-1.5">
            {analysis.projectDomains.map((dm) => (
              <Badge key={dm} tone="primary">
                <FlaskConical className="mr-1 inline size-3" />
                {dm}
              </Badge>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function Detected({
  label,
  value,
  confidence,
}: {
  label: string;
  value: string | number | null;
  confidence?: number | null;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-2 text-right text-sm font-medium">
        {value ?? <span className="text-muted-foreground">Not detected</span>}
        {value != null && confidence != null && (
          <Badge tone={CONFIDENCE_TONE(confidence)}>{confidence}%</Badge>
        )}
      </dd>
    </div>
  );
}

function scoreColor(n: number) {
  return n >= 70 ? "text-success" : n >= 45 ? "text-primary" : "text-muted-foreground";
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    (m.get(k) ?? m.set(k, []).get(k)!).push(it);
  }
  return m;
}
