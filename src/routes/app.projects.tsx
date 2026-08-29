import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Rocket,
  ExternalLink,
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
  Star,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { Panel, Badge, EmptyState, Skeleton } from "@/components/worklens/Panel";
import {
  listProjects,
  getProjectRecommendations,
  getUserProjects,
  startProject,
  updateProject,
  deleteProject,
} from "@/lib/projects-fns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/projects")({
  head: () => ({
    meta: [
      { title: "Projects — WorkLens" },
      {
        name: "description",
        content: "Browse project ideas, get AI recommendations, and track your project progress.",
      },
    ],
  }),
  component: Projects,
});

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "text-success",
  intermediate: "text-primary",
  advanced: "text-warning",
};

function ProjectCard({
  project,
  onStart,
  isStarting,
}: {
  project: {
    slug: string;
    title: string;
    description: string;
    difficulty: string;
    technologies: string[];
    estimatedHours: number | null;
    matchScore?: number;
    coverage?: number;
  };
  onStart: () => void;
  isStarting: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-4 transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{project.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{project.description}</p>
        </div>
        {project.matchScore !== undefined && (
          <Badge tone={project.matchScore >= 60 ? "success" : project.matchScore >= 40 ? "primary" : "muted"}>
            {project.matchScore}% match
          </Badge>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone={project.difficulty === "advanced" ? "warning" : project.difficulty === "intermediate" ? "primary" : "success"}>
          {project.difficulty}
        </Badge>
        {project.estimatedHours && (
          <span className="text-xs text-muted-foreground">{project.estimatedHours}h estimated</span>
        )}
        {project.coverage !== undefined && (
          <span className="text-xs text-muted-foreground">{project.coverage}% skill coverage</span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {project.technologies.slice(0, 6).map((t) => (
          <span key={t} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {t}
          </span>
        ))}
        {project.technologies.length > 6 && (
          <span className="text-xs text-muted-foreground">+{project.technologies.length - 6}</span>
        )}
      </div>
      <div className="mt-3">
        <button
          onClick={onStart}
          disabled={isStarting}
          className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          <Rocket className="size-3" />
          {isStarting ? "Starting…" : "Start project"}
        </button>
      </div>
    </div>
  );
}

function TrackedProject({
  project,
  onUpdate,
  onDelete,
}: {
  project: {
    id: string;
    title: string;
    source: string;
    status: string;
    repoUrl: string | null;
    notes: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
  };
  onUpdate: (updates: { projectId: string; status?: string; repoUrl?: string }) => void;
  onDelete: (projectId: string) => void;
}) {
  const [repoUrl, setRepoUrl] = useState(project.repoUrl ?? "");

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{project.title}</h3>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Badge
              tone={
                project.status === "completed"
                  ? "success"
                  : project.status === "in_progress"
                    ? "primary"
                    : "muted"
              }
            >
              {project.status === "completed"
                ? "Completed"
                : project.status === "in_progress"
                  ? "In progress"
                  : "Not started"}
            </Badge>
            <span>Source: {project.source.replace(/_/g, " ")}</span>
            {project.startedAt && (
              <span>Started {new Date(project.startedAt).toLocaleDateString()}</span>
            )}
          </div>
        </div>
        <button
          onClick={() => onDelete(project.id)}
          className="rounded-md p-1.5 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          placeholder="GitHub repo URL"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          onBlur={() => onUpdate({ projectId: project.id, repoUrl })}
          className="flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {project.status !== "completed" && (
          <button
            onClick={() =>
              onUpdate({
                projectId: project.id,
                status: project.status === "in_progress" ? "completed" : "in_progress",
              })
            }
            className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
          >
            {project.status === "in_progress" ? (
              <>
                <CheckCircle2 className="size-3" /> Complete
              </>
            ) : (
              <>
                <Clock className="size-3" /> Start
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function Projects() {
  const router = useRouter();
  const [difficulty, setDifficulty] = useState<string>("");
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const recommendations = useQuery({
    queryKey: ["project-recommendations"],
    queryFn: () => getProjectRecommendations(),
  });

  const tracked = useQuery({
    queryKey: ["user-projects"],
    queryFn: () => getUserProjects(),
  });

  const startMutation = useMutation({
    mutationFn: (data: { projectSlug: string; title: string; source: "ai_recommended" }) =>
      startProject({ data }),
    onSuccess: async () => {
      toast.success("Project started!");
      await router.invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { projectId: string; status?: string; repoUrl?: string }) =>
      updateProject({ data: data as Parameters<typeof updateProject>[0]["data"] }),
    onSuccess: async () => {
      await router.invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (projectId: string) => deleteProject({ data: { projectId } }),
    onSuccess: async () => {
      toast.success("Project removed");
      await router.invalidate();
    },
  });

  const addMutation = useMutation({
    mutationFn: () =>
      startProject({
        data: { title: newTitle.trim(), source: "user_created" },
      }),
    onSuccess: async () => {
      toast.success("Project added!");
      setNewTitle("");
      setShowAdd(false);
      await router.invalidate();
    },
  });

  return (
    <div className="space-y-6">
      {/* Tracked projects */}
      <Panel
        title="Your projects"
        description="Projects you're working on or have completed."
        action={
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <Plus className="size-3.5" /> Add project
          </button>
        }
      >
        {showAdd && (
          <div className="mb-4 flex items-center gap-2">
            <input
              placeholder="Project name"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTitle.trim()) addMutation.mutate();
              }}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={() => addMutation.mutate()}
              disabled={!newTitle.trim() || addMutation.isPending}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
        {tracked.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : tracked.data && tracked.data.length > 0 ? (
          <div className="space-y-3">
            {tracked.data.map((p) => (
              <TrackedProject
                key={p.id}
                project={p}
                onUpdate={(updates) => updateMutation.mutate(updates)}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Rocket className="size-6" />}
            title="No projects tracked yet"
            description="Start a project from the recommendations below, or add your own."
          />
        )}
      </Panel>

      {/* AI Recommendations */}
      <Panel
        title="Recommended for you"
        description="Projects matched to your skill gaps — pick ones that develop what you're missing."
      >
        {recommendations.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : recommendations.data && recommendations.data.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {recommendations.data.slice(0, 6).map((p) => (
              <ProjectCard
                key={p.slug}
                project={p}
                onStart={() =>
                  startMutation.mutate({
                    projectSlug: p.slug,
                    title: p.title,
                    source: "ai_recommended",
                  })
                }
                isStarting={startMutation.isPending}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No recommendations yet"
            description="Upload a resume and analyze a job to get personalized project recommendations."
          />
        )}
      </Panel>

      {/* Full catalog */}
      <Panel
        title="Project catalog"
        description="Browse all available projects by difficulty."
        action={
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs"
          >
            <option value="">All levels</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        }
      >
        <ProjectCatalog
          difficulty={difficulty}
          onStart={(slug, title) =>
            startMutation.mutate({ projectSlug: slug, title, source: "ai_recommended" })
          }
          isStarting={startMutation.isPending}
        />
      </Panel>
    </div>
  );
}

function ProjectCatalog({
  difficulty,
  onStart,
  isStarting,
}: {
  difficulty: string;
  onStart: (slug: string, title: string) => void;
  isStarting: boolean;
}) {
  const projects = useQuery({
    queryKey: ["catalog-projects", difficulty],
    queryFn: () =>
      listProjects({
        data: { difficulty: (difficulty || undefined) as "beginner" | "intermediate" | "advanced" | undefined },
      }),
  });

  if (projects.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (!projects.data || projects.data.length === 0) {
    return <EmptyState title="No projects found" description="Try a different difficulty filter." />;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {projects.data.map((p) => (
        <ProjectCard
          key={p.slug}
          project={p}
          onStart={() => onStart(p.slug, p.title)}
          isStarting={isStarting}
        />
      ))}
    </div>
  );
}
