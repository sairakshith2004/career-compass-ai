import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  Plus,
  Trash2,
  ChevronRight,
  ExternalLink,
  Calendar,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

import { Panel, Badge, EmptyState, Skeleton } from "@/components/worklens/Panel";
import {
  listJobApplications,
  createJobApplication,
  updateJobApplication,
  deleteJobApplication,
  getApplicationStats,
} from "@/lib/job-applications-fns";
import { listJobs } from "@/lib/server-fns";
import { cn } from "@/lib/utils";
import { JOB_APPLICATION_STATUSES } from "@/lib/db/career-schema";

export const Route = createFileRoute("/app/applications")({
  head: () => ({
    meta: [
      { title: "Job Applications — WorkLens" },
      {
        name: "description",
        content: "Track your job applications, interviews, and results.",
      },
    ],
  }),
  component: Applications,
});

const STATUS_LABELS: Record<string, string> = {
  saved: "Saved",
  applied: "Applied",
  assessment: "Assessment",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const STATUS_COLORS: Record<string, string> = {
  saved: "muted",
  applied: "primary",
  assessment: "warning",
  interview: "primary",
  offer: "success",
  rejected: "muted",
  withdrawn: "muted",
};

const PIPELINE = ["saved", "applied", "assessment", "interview", "offer"] as const;

function ApplicationCard({
  app,
  onUpdate,
  onDelete,
}: {
  app: {
    id: string;
    status: string;
    appliedAt: Date | null;
    interviewStage: string | null;
    notes: string | null;
    jobTitle: string | null;
    jobCompany: string | null;
    jobLocation: string | null;
    jobId: string;
    matchScore: number | null;
  };
  onUpdate: (data: { applicationId: string; status?: string; notes?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [notes, setNotes] = useState(app.notes ?? "");

  const nextStatus = PIPELINE.indexOf(app.status as (typeof PIPELINE)[number]);
  const canAdvance = nextStatus >= 0 && nextStatus < PIPELINE.length - 1;
  const nextStatusValue = canAdvance ? PIPELINE[nextStatus + 1] : null;

  return (
    <div className="rounded-lg border border-border p-4 transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {app.jobTitle || "Untitled role"}
            {app.jobCompany ? ` · ${app.jobCompany}` : ""}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge tone={STATUS_COLORS[app.status] as "muted" | "primary" | "warning" | "success"}>
              {STATUS_LABELS[app.status] ?? app.status}
            </Badge>
            {app.jobLocation && <span>{app.jobLocation}</span>}
            {app.matchScore !== null && <span>{app.matchScore}% match</span>}
            {app.appliedAt && <span>Applied {new Date(app.appliedAt).toLocaleDateString()}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link
            to="/app/jobs"
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
            title="View job details"
          >
            <ExternalLink className="size-3.5" />
          </Link>
          <button
            onClick={() => onDelete(app.id)}
            className="rounded-md p-1.5 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Pipeline progress */}
      <div className="mt-3 flex items-center gap-1">
        {PIPELINE.map((s, i) => {
          const currentIdx = PIPELINE.indexOf(app.status as (typeof PIPELINE)[number]);
          const isPast = i < currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <div key={s} className="flex items-center gap-1">
              <div
                className={cn(
                  "size-2 rounded-full",
                  isPast ? "bg-success" : isCurrent ? "bg-primary" : "bg-muted",
                )}
              />
              {i < PIPELINE.length - 1 && (
                <div className={cn("h-px w-4", isPast ? "bg-success" : "bg-muted")} />
              )}
            </div>
          );
        })}
      </div>

      {/* Notes */}
      <div className="mt-3">
        <textarea
          placeholder="Add notes…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== (app.notes ?? "")) {
              onUpdate({ applicationId: app.id, notes });
            }
          }}
          rows={2}
          className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2">
        {canAdvance && nextStatusValue && (
          <button
            onClick={() => onUpdate({ applicationId: app.id, status: nextStatusValue })}
            className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Move to {STATUS_LABELS[nextStatusValue]}
            <ChevronRight className="size-3" />
          </button>
        )}
        {app.status === "rejected" && (
          <button
            onClick={() => onUpdate({ applicationId: app.id, status: "saved" })}
            className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Re-open
          </button>
        )}
      </div>
    </div>
  );
}

function Applications() {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState("");

  const applications = useQuery({
    queryKey: ["job-applications"],
    queryFn: () => listJobApplications(),
  });

  const stats = useQuery({
    queryKey: ["application-stats"],
    queryFn: () => getApplicationStats(),
  });

  const jobs = useQuery({
    queryKey: ["jobs-for-applications"],
    queryFn: () => listJobs(),
    enabled: showAdd,
  });

  const addMutation = useMutation({
    mutationFn: () => createJobApplication({ data: { jobId: selectedJobId } }),
    onSuccess: async () => {
      toast.success("Application tracked!");
      setShowAdd(false);
      setSelectedJobId("");
      await router.invalidate();
    },
    onError: (err: Error) => toast.error(err.message || "Couldn't add application"),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { applicationId: string; status?: string; notes?: string }) =>
      updateJobApplication({ data: data as Parameters<typeof updateJobApplication>[0]["data"] }),
    onSuccess: async () => await router.invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteJobApplication({ data: { applicationId: id } }),
    onSuccess: async () => {
      toast.success("Application removed");
      await router.invalidate();
    },
  });

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats.data && stats.data.total > 0 && (
        <div className="grid gap-4 sm:grid-cols-4">
          <Panel title="Total applications">
            <p className="text-3xl font-semibold tracking-tight">{stats.data.total}</p>
          </Panel>
          <Panel title="Applied">
            <p className="text-3xl font-semibold tracking-tight text-primary">
              {stats.data.byStatus["applied"] ?? 0}
            </p>
          </Panel>
          <Panel title="Interviews">
            <p className="text-3xl font-semibold tracking-tight text-warning">
              {stats.data.byStatus["interview"] ?? 0}
            </p>
          </Panel>
          <Panel title="Offers">
            <p className="text-3xl font-semibold tracking-tight text-success">
              {stats.data.byStatus["offer"] ?? 0}
            </p>
          </Panel>
        </div>
      )}

      {/* Applications list */}
      <Panel
        title="Job applications"
        description="Track every application from saved to offer."
        action={
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <Plus className="size-3.5" /> Track application
          </button>
        }
      >
        {showAdd && (
          <div className="mb-4 flex items-center gap-2">
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select an analyzed job…</option>
              {jobs.data?.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title || "Untitled"} {j.company ? `· ${j.company}` : ""}
                </option>
              ))}
            </select>
            <button
              onClick={() => addMutation.mutate()}
              disabled={!selectedJobId || addMutation.isPending}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {addMutation.isPending ? "Adding…" : "Add"}
            </button>
          </div>
        )}

        {applications.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : applications.data && applications.data.length > 0 ? (
          <div className="space-y-3">
            {applications.data.map((app) => (
              <ApplicationCard
                key={app.id}
                app={app}
                onUpdate={(data) => updateMutation.mutate(data)}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Briefcase className="size-6" />}
            title="No applications tracked"
            description="Analyze a job description first, then track your applications here."
            action={
              <Link
                to="/app/jobs"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Analyze a job
              </Link>
            }
          />
        )}
      </Panel>
    </div>
  );
}
