import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Search, Sparkles, Star, Target, X } from "lucide-react";
import { toast } from "sonner";

import { Panel, Badge, EmptyState } from "@/components/worklens/Panel";
import { cn } from "@/lib/utils";
import {
  getCareerProfileData,
  saveCareerProfile,
  type CareerProfileCatalog,
  type CareerProfileView,
} from "@/lib/career-profile-fns";

export const Route = createFileRoute("/app/career")({
  head: () => ({ meta: [{ title: "Career Profile — WorkLens" }] }),
  loader: (): Promise<{ profile: CareerProfileView; catalog: CareerProfileCatalog }> =>
    getCareerProfileData(),
  component: CareerProfilePage,
});

const field =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function Labeled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {hint && <span className="ml-2 text-xs text-muted-foreground">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

/** A chip toggle. */
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border hover:border-primary/50",
      )}
    >
      {children}
    </button>
  );
}

function CareerProfilePage() {
  const { profile, catalog } = Route.useLoaderData();
  const router = useRouter();
  const d = profile.detected;

  const [branchSlug, setBranchSlug] = useState(profile.identity.branchSlug ?? "");
  const [specialization, setSpecialization] = useState(profile.identity.specialization ?? "");
  const [degree, setDegree] = useState(profile.identity.degree ?? "");
  const [collegeName, setCollegeName] = useState(profile.identity.collegeName ?? "");
  const [graduationYear, setGraduationYear] = useState(
    profile.identity.graduationYear ? String(profile.identity.graduationYear) : "",
  );
  const [experienceLevel, setExperienceLevel] = useState(profile.identity.experienceLevel ?? "");
  const [careerGoals, setCareerGoals] = useState(profile.careerGoals ?? "");

  const [roles, setRoles] = useState(
    profile.targetRoles.map((r) => ({ slug: r.slug, name: r.name, isPrimary: r.isPrimary })),
  );
  const [roleQuery, setRoleQuery] = useState("");

  const [industries, setIndustries] = useState<string[]>(
    profile.preferences.industries.map((i) => i.slug),
  );
  const [jobTypes, setJobTypes] = useState<string[]>(
    profile.preferences.jobTypes.map((j) => j.value),
  );
  const [workMode, setWorkMode] = useState(profile.preferences.workMode ?? "");
  const [locations, setLocations] = useState<string[]>(profile.preferences.locations);
  const [locInput, setLocInput] = useState("");

  const roleResults = useMemo(() => {
    const q = roleQuery.trim().toLowerCase();
    const selected = new Set(roles.map((r) => r.slug));
    return catalog.roles
      .filter((r) => !selected.has(r.slug))
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q))
      .slice(0, 40);
  }, [roleQuery, roles, catalog.roles]);

  function addRole(slug: string, name: string) {
    setRoles((prev) =>
      prev.some((r) => r.slug === slug)
        ? prev
        : [...prev, { slug, name, isPrimary: prev.length === 0 }].slice(0, catalog.maxTargetRoles),
    );
  }
  function removeRole(slug: string) {
    setRoles((prev) => {
      const next = prev.filter((r) => r.slug !== slug);
      if (!next.some((r) => r.isPrimary) && next[0]) next[0].isPrimary = true;
      return [...next];
    });
  }
  function makePrimary(slug: string) {
    setRoles((prev) => prev.map((r) => ({ ...r, isPrimary: r.slug === slug })));
  }

  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  function addLocation(raw: string) {
    const v = raw.trim();
    if (!v) return;
    setLocations((prev) =>
      prev.includes(v) ? prev : [...prev, v].slice(0, catalog.maxPreferredLocations),
    );
    setLocInput("");
  }

  const primary = roles.find((r) => r.isPrimary);

  const save = useMutation({
    mutationFn: () =>
      saveCareerProfile({
        data: {
          branchSlug: branchSlug || undefined,
          specialization: specialization.trim() || undefined,
          degree: (degree || undefined) as never,
          collegeName: collegeName.trim() || undefined,
          graduationYear: graduationYear || undefined,
          experienceLevel: (experienceLevel || undefined) as never,
          careerGoals: careerGoals.trim() || undefined,
          preferredIndustries: industries,
          preferredJobTypes: jobTypes,
          preferredLocations: locations,
          workMode: (workMode || undefined) as never,
          targetRoleSlugs: roles.map((r) => r.slug),
          primaryRoleSlug: primary?.slug,
        },
      }),
    onSuccess: async () => {
      toast.success("Career profile saved");
      await router.invalidate();
    },
    onError: () => toast.error("Couldn't save — check the form and try again"),
  });

  const SuggestBtn = ({ onUse, value }: { onUse: () => void; value: string | number | null }) =>
    value == null || value === "" ? null : (
      <button
        type="button"
        onClick={onUse}
        className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
      >
        <Sparkles className="size-3" /> AI: {value} — use
      </button>
    );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Career Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Who you are, what you want, and where you want to work. AI-detected details are only ever
          suggestions — nothing is applied until you save.
        </p>
      </header>

      {/* --- identity --- */}
      <Panel title="Who you are">
        <div className="grid gap-4 sm:grid-cols-2">
          <Labeled
            label="Engineering branch"
            hint={
              d?.branchSlug &&
              d.branchSlug !== branchSlug && (
                <SuggestBtn value={d.branchName} onUse={() => setBranchSlug(d.branchSlug!)} />
              )
            }
          >
            <select
              className={field}
              value={branchSlug}
              onChange={(e) => setBranchSlug(e.target.value)}
            >
              <option value="">Select…</option>
              {catalog.branches.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.name}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled
            label="Specialization"
            hint={
              d?.specialization &&
              d.specialization !== specialization && (
                <SuggestBtn
                  value={d.specialization}
                  onUse={() => setSpecialization(d.specialization!)}
                />
              )
            }
          >
            <input
              className={field}
              value={specialization}
              onChange={(e) => setSpecialization(e.target.value)}
            />
          </Labeled>
          <Labeled
            label="Degree"
            hint={d?.degree && <SuggestBtn value={d.degree} onUse={() => setDegree(d.degree!)} />}
          >
            <select className={field} value={degree} onChange={(e) => setDegree(e.target.value)}>
              <option value="">Select…</option>
              {catalog.degrees.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled
            label="College / university"
            hint={
              d?.collegeName &&
              d.collegeName !== collegeName && (
                <SuggestBtn value={d.collegeName} onUse={() => setCollegeName(d.collegeName!)} />
              )
            }
          >
            <input
              className={field}
              value={collegeName}
              onChange={(e) => setCollegeName(e.target.value)}
            />
          </Labeled>
          <Labeled
            label="Graduation year"
            hint={
              d?.graduationYear && (
                <SuggestBtn
                  value={d.graduationYear}
                  onUse={() => setGraduationYear(String(d.graduationYear))}
                />
              )
            }
          >
            <input
              type="number"
              inputMode="numeric"
              className={field}
              value={graduationYear}
              onChange={(e) => setGraduationYear(e.target.value)}
            />
          </Labeled>
          <Labeled
            label="Experience level"
            hint={
              d?.experienceLevel &&
              d.experienceLevel !== experienceLevel && (
                <SuggestBtn
                  value={d.experienceLevel}
                  onUse={() => setExperienceLevel(d.experienceLevel!)}
                />
              )
            }
          >
            <select
              className={field}
              value={experienceLevel}
              onChange={(e) => setExperienceLevel(e.target.value)}
            >
              <option value="">Select…</option>
              {catalog.experienceLevels.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </Labeled>
        </div>
        {profile.currentSkills.length > 0 && (
          <p className="mt-4 text-xs text-muted-foreground">
            {profile.currentSkills.length} skills on record —{" "}
            <Link to="/app/skills" className="text-primary hover:underline">
              manage them
            </Link>
            .
          </p>
        )}
      </Panel>

      {/* --- target roles --- */}
      <Panel
        title="Target roles"
        description="Pick the roles you're aiming for — from any branch. Mark one as primary; that's what your skill-gap analysis and roadmap will use."
      >
        {roles.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {roles.map((r) => (
              <span
                key={r.slug}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                  r.isPrimary ? "border-primary bg-primary/10 text-primary" : "border-border",
                )}
              >
                {r.isPrimary && <Star className="size-3 fill-current" />}
                {r.name}
                {!r.isPrimary && (
                  <button
                    type="button"
                    onClick={() => makePrimary(r.slug)}
                    title="Set as primary"
                    className="text-muted-foreground hover:text-primary"
                  >
                    <Star className="size-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeRole(r.slug)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {roles.length < catalog.maxTargetRoles && (
          <>
            <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm">
              <Search className="size-3.5 text-muted-foreground" />
              <input
                className="w-full bg-transparent outline-none"
                placeholder="Search roles (e.g. backend, VLSI, robotics)…"
                value={roleQuery}
                onChange={(e) => setRoleQuery(e.target.value)}
              />
            </div>
            {roleQuery.trim() && (
              <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                {roleResults.length === 0 && (
                  <p className="p-2 text-sm text-muted-foreground">No roles match "{roleQuery}".</p>
                )}
                {roleResults.map((r) => (
                  <button
                    key={r.slug}
                    type="button"
                    onClick={() => {
                      addRole(r.slug, r.name);
                      setRoleQuery("");
                    }}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span>{r.name}</span>
                    <span className="text-xs text-muted-foreground">{r.category}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {d && d.suggestedRoles.length > 0 && (
          <div className="mt-3 rounded-lg bg-muted/50 p-3">
            <p className="text-xs font-medium text-muted-foreground">From your résumé</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {d.suggestedRoles.map((s) => (
                <button
                  key={s.title}
                  type="button"
                  disabled={!s.slug || roles.some((r) => r.slug === s.slug)}
                  onClick={() => s.slug && addRole(s.slug, s.title)}
                  className="rounded-full border border-border px-2.5 py-1 text-xs hover:border-primary/50 disabled:opacity-40"
                >
                  {s.title} · {s.score}%
                </button>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {/* --- preferences --- */}
      <Panel title="Preferences">
        <div className="space-y-4">
          <Labeled label="Preferred industries" hint="optional">
            <div className="flex flex-wrap gap-1.5">
              {catalog.industries.map((i) => (
                <Chip
                  key={i.slug}
                  active={industries.includes(i.slug)}
                  onClick={() => setIndustries((p) => toggle(p, i.slug))}
                >
                  {i.name}
                </Chip>
              ))}
            </div>
          </Labeled>
          <Labeled label="Job types" hint="optional">
            <div className="flex flex-wrap gap-1.5">
              {catalog.jobTypes.map((j) => (
                <Chip
                  key={j.value}
                  active={jobTypes.includes(j.value)}
                  onClick={() => setJobTypes((p) => toggle(p, j.value))}
                >
                  {j.label}
                </Chip>
              ))}
            </div>
          </Labeled>
          <Labeled label="Work mode" hint="optional">
            <div className="flex flex-wrap gap-1.5">
              {catalog.workModes.map((w) => (
                <Chip
                  key={w.value}
                  active={workMode === w.value}
                  onClick={() => setWorkMode(w.value)}
                >
                  {w.label}
                </Chip>
              ))}
            </div>
          </Labeled>
          <Labeled label="Preferred locations" hint="press Enter to add">
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1.5">
              {locations.map((l) => (
                <span
                  key={l}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                >
                  {l}
                  <button
                    type="button"
                    onClick={() => setLocations((p) => p.filter((x) => x !== l))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <input
                className="flex-1 bg-transparent px-1 text-sm outline-none"
                placeholder={locations.length ? "" : "e.g. Bengaluru, Remote"}
                value={locInput}
                onChange={(e) => setLocInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addLocation(locInput);
                  }
                }}
                onBlur={() => addLocation(locInput)}
              />
            </div>
          </Labeled>
        </div>
      </Panel>

      {/* --- career goals --- */}
      <Panel title="Career goals" description="A sentence or two on where you want this to go.">
        <textarea
          rows={3}
          className={field}
          value={careerGoals}
          onChange={(e) => setCareerGoals(e.target.value)}
          placeholder="e.g. Land a backend role at a product company within a year of graduating."
        />
      </Panel>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save career profile"}
        </button>
      </div>

      {/* --- phase 7 readiness --- */}
      <Phase7Card phase7={profile.phase7} primaryRoleName={profile.primaryRole?.name ?? null} />
    </div>
  );
}

function Phase7Card({
  phase7,
  primaryRoleName,
}: {
  phase7: CareerProfileView["phase7"];
  primaryRoleName: string | null;
}) {
  return (
    <Panel title="Skill-gap analysis readiness">
      {phase7.ready ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium text-success">
            <CheckCircle2 className="size-4" /> Ready to analyse your gap to{" "}
            {primaryRoleName ?? "your target role"}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Skills on record" value={phase7.currentSkillCount} />
            <Stat label="Skills this role needs" value={phase7.requiredSkillCount} />
            <Stat
              label="Already covered"
              value={`${phase7.coveredRequiredSkills} / ${phase7.requiredSkillCount}`}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            The skill-gap engine (next phase) will turn this into a prioritised list and a roadmap.
          </p>
        </div>
      ) : (
        <EmptyState
          icon={<Target className="size-6" />}
          title="A few things first"
          description="Complete these so WorkLens can analyse your skill gap for your target role:"
          action={
            <ul className="space-y-1.5 text-left text-sm">
              {phase7.missing.map((m) => (
                <li key={m} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-warning" />
                  {m}
                </li>
              ))}
            </ul>
          }
        />
      )}
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-lg font-semibold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
