import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { CheckCircle2, FileText, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { Panel, EmptyState, Badge } from "@/components/worklens/Panel";
import { getCurrentUser, getLatestResume, uploadResume } from "@/lib/server-fns";
import { SKILLS_CATALOG } from "@/lib/skills-catalog";
import { cn } from "@/lib/utils";

const SKILL_NAME_BY_SLUG = new Map(SKILLS_CATALOG.map((s) => [s.slug, s.name]));

export const Route = createFileRoute("/app/resume")({
  head: () => ({
    meta: [
      { title: "Resume Intelligence — WorkLens" },
      {
        name: "description",
        content:
          "Upload a PDF, DOCX or TXT resume and turn it into structured, evidence-backed skill data.",
      },
      { property: "og:title", content: "Resume Intelligence — WorkLens" },
      {
        property: "og:description",
        content: "Structured extraction of demonstrated skills from your resume.",
      },
    ],
  }),
  loader: async () => {
    const [user, resume] = await Promise.all([getCurrentUser(), getLatestResume()]);
    return { user, resume };
  },
  component: Resume,
});

function Resume() {
  const { user, resume } = Route.useLoaderData();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const mutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return uploadResume({ data: formData });
    },
    onSuccess: async (result) => {
      toast.success(
        result.skillsDetected > 0
          ? `Resume parsed — ${result.skillsDetected} skill${result.skillsDetected === 1 ? "" : "s"} detected`
          : "Resume uploaded — no catalog skills detected in the text",
      );
      await router.invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't process that resume — try again");
    },
  });

  function handleFile(file: File | undefined) {
    if (!file) return;
    mutation.mutate(file);
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <Panel title="Upload resume">
          <EmptyState
            icon={<FileText className="size-6" />}
            title="Sign in to upload a resume"
            description="Your resume and extracted skills are tied to your account."
          />
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Upload resume"
        description="PDF, DOCX or TXT, max 5 MB. Re-uploading replaces your current resume."
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
            handleFile(e.dataTransfer.files[0]);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center rounded-lg border border-dashed px-6 py-12 text-center transition-colors",
            dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
            mutation.isPending && "pointer-events-none opacity-60",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <UploadCloud className="size-6 text-primary" />
          <p className="mt-3 text-sm font-medium">
            {mutation.isPending
              ? "Parsing your resume…"
              : "Drag and drop your resume, or click to browse"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">PDF, DOCX or TXT — up to 5 MB.</p>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Current resume">
          {resume ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <FileText className="size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{resume.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    Uploaded {new Date(resume.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge tone="success">
                  <CheckCircle2 className="mr-1 inline size-3" />
                  Parsed
                </Badge>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No resume yet"
              description="Upload a resume above to seed your skill profile and unlock your dashboard."
            />
          )}
        </Panel>

        <Panel
          title="Skills detected"
          {...(resume && { description: "Matched against WorkLens's skills catalog." })}
        >
          {!resume ? (
            <EmptyState
              title="Nothing parsed yet"
              description="Skills mentioned in your resume will appear here once it's uploaded."
            />
          ) : resume.structuredData && resume.structuredData.skills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {resume.structuredData.skills.map((slug) => (
                <Badge key={slug} tone="primary">
                  {SKILL_NAME_BY_SLUG.get(slug) ?? slug}
                </Badge>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No recognizable skills found"
              description="Your resume didn't mention any skills from our catalog by name — try adding specific technologies, languages or tools."
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
