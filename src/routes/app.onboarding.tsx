import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Check, Search } from "lucide-react";
import { toast } from "sonner";

import { Panel } from "@/components/worklens/Panel";
import { cn } from "@/lib/utils";
import {
  getOnboarding,
  saveOnboardingStep1,
  saveOnboardingStep2,
  saveOnboardingStep3,
  saveOnboardingStep4,
  finishOnboarding,
  type OnboardingCatalog,
  type OnboardingState,
} from "@/lib/onboarding-fns";

const STEP_TITLES = [
  "Academic background",
  "Engineering branch",
  "Current year & graduation",
  "Career direction",
  "Review",
];

export const Route = createFileRoute("/app/onboarding")({
  head: () => ({ meta: [{ title: "Set up your profile — WorkLens" }] }),
  validateSearch: z.object({
    step: z.number().int().min(1).max(5).optional().catch(undefined),
  }),
  loader: (): Promise<{ state: OnboardingState; catalog: OnboardingCatalog }> => getOnboarding(),
  component: Onboarding,
});

const fieldClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function Labeled({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {hint && <span className="ml-2 text-xs text-muted-foreground">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Onboarding() {
  const { state, catalog } = Route.useLoaderData() as {
    state: OnboardingState;
    catalog: OnboardingCatalog;
  };
  const search = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();

  const step = search.step ?? state.resumeStep;
  const maxReachable = state.completed ? 5 : Math.min(state.lastCompletedStep + 1, 5);

  const goto = (next: number) =>
    navigate({ to: "/app/onboarding", search: { step: Math.min(Math.max(next, 1), 5) } });

  async function afterSave() {
    await router.invalidate();
  }

  const common = { state, catalog, goto, afterSave, navigate };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {state.completed ? "Your student profile" : "Set up your profile"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {state.completed
            ? "Update anything that's changed."
            : "A few quick questions so WorkLens understands where you're starting from."}
        </p>
      </header>

      <ol className="flex flex-wrap gap-2 text-xs">
        {STEP_TITLES.map((title, i) => {
          const n = i + 1;
          const reachable = n <= maxReachable;
          return (
            <li key={title}>
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && goto(n)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors",
                  n === step
                    ? "border-primary bg-primary/10 text-primary"
                    : reachable
                      ? "border-border text-muted-foreground hover:border-primary/50"
                      : "border-border/50 text-muted-foreground/40",
                )}
              >
                <span
                  className={cn(
                    "grid size-4 place-items-center rounded-full text-[10px]",
                    n < step || state.completed ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {n < step || state.completed ? <Check className="size-2.5" /> : n}
                </span>
                <span className="hidden sm:inline">{title}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <Panel title={`Step ${step} of 5 — ${STEP_TITLES[step - 1]}`}>
        {step === 1 && <Step1 {...common} />}
        {step === 2 && <Step2 {...common} />}
        {step === 3 && <Step3 {...common} />}
        {step === 4 && <Step4 {...common} />}
        {step === 5 && <Step5 {...common} />}
      </Panel>
    </div>
  );
}

type StepProps = {
  state: OnboardingState;
  catalog: OnboardingCatalog;
  goto: (n: number) => void;
  afterSave: () => Promise<void>;
  navigate: ReturnType<typeof useNavigate>;
};

function FooterNav({
  step,
  onBack,
  onNext,
  onSkip,
  onSaveExit,
  nextLabel = "Next",
  pending,
}: {
  step: number;
  onBack?: () => void;
  onNext: () => void;
  onSkip?: () => void;
  onSaveExit?: () => void;
  nextLabel?: string;
  pending: boolean;
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
      <div>
        {step > 1 && (
          <button
            type="button"
            onClick={onBack}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <ArrowLeft className="size-4" /> Back
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {onSaveExit && (
          <button
            type="button"
            onClick={onSaveExit}
            disabled={pending}
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Save &amp; finish later
          </button>
        )}
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            disabled={pending}
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Skip
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : nextLabel}
          {!pending && nextLabel === "Next" && <ArrowRight className="size-4" />}
        </button>
      </div>
    </div>
  );
}

// --- Step 1: academic background ------------------------------------------------

function Step1({ state, catalog, goto, afterSave, navigate }: StepProps) {
  const [fullName, setFullName] = useState(state.fullName);
  const [degree, setDegree] = useState(state.degree ?? "");
  const [collegeName, setCollegeName] = useState(state.collegeName ?? "");
  const [countryCode, setCountryCode] = useState(state.countryCode ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      saveOnboardingStep1({
        data: {
          fullName: fullName.trim(),
          degree: (degree || undefined) as never,
          collegeName: collegeName.trim() || undefined,
          countryCode: countryCode || undefined,
        },
      }),
    onSuccess: afterSave,
  });

  async function persist(): Promise<boolean> {
    setError(null);
    if (fullName.trim().length < 2) {
      setError("Enter your full name.");
      return false;
    }
    try {
      await save.mutateAsync();
      return true;
    } catch {
      setError("Couldn't save. Please try again.");
      return false;
    }
  }

  return (
    <div className="space-y-4">
      <Labeled label="Full name">
        <input
          className={fieldClass}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
        />
      </Labeled>
      <Labeled label="Engineering degree" hint="optional">
        <select className={fieldClass} value={degree} onChange={(e) => setDegree(e.target.value)}>
          <option value="">Select a degree…</option>
          {catalog.degrees.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </Labeled>
      <Labeled label="College / university" hint="optional">
        <input
          className={fieldClass}
          value={collegeName}
          onChange={(e) => setCollegeName(e.target.value)}
          placeholder="e.g. NIT Trichy"
        />
      </Labeled>
      <Labeled label="Country" hint="optional">
        <select
          className={fieldClass}
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value)}
        >
          <option value="">Select a country…</option>
          {catalog.countries.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </Labeled>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <FooterNav
        step={1}
        pending={save.isPending}
        onNext={async () => {
          if (await persist()) goto(2);
        }}
        onSaveExit={async () => {
          if (await persist()) navigate({ to: "/app" });
        }}
      />
    </div>
  );
}

// --- Step 2: engineering branch ----------------------------------------------

function Step2({ state, catalog, goto, afterSave, navigate }: StepProps) {
  const [branchSlug, setBranchSlug] = useState(state.branchSlug ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      saveOnboardingStep2({ data: { branchSlug: (branchSlug || undefined) as never } }),
    onSuccess: afterSave,
  });

  async function persist(): Promise<boolean> {
    setError(null);
    try {
      await save.mutateAsync();
      return true;
    } catch {
      setError("Couldn't save. Please try again.");
      return false;
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Your branch is just your academic background — it doesn't lock you into a career. You'll
        pick a career direction separately in the next step.
      </p>
      <Labeled label="Engineering branch or specialization" hint="optional">
        <select
          className={fieldClass}
          value={branchSlug}
          onChange={(e) => setBranchSlug(e.target.value)}
        >
          <option value="">Select a branch…</option>
          {catalog.branchGroups.map((group) => (
            <optgroup key={group.category} label={group.category}>
              {group.branches.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Labeled>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <FooterNav
        step={2}
        pending={save.isPending}
        onBack={() => goto(1)}
        onSkip={async () => {
          if (await persist()) goto(3);
        }}
        onNext={async () => {
          if (await persist()) goto(3);
        }}
        onSaveExit={async () => {
          if (await persist()) navigate({ to: "/app" });
        }}
      />
    </div>
  );
}

// --- Step 3: current year & graduation --------------------------------------

function Step3({ state, catalog, goto, afterSave, navigate }: StepProps) {
  const [currentYear, setCurrentYear] = useState(state.currentYear ?? "");
  const [graduationYear, setGraduationYear] = useState(
    state.graduationYear ? String(state.graduationYear) : "",
  );
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      saveOnboardingStep3({
        data: {
          currentYear: (currentYear || undefined) as never,
          graduationYear: graduationYear || undefined,
        },
      }),
    onSuccess: afterSave,
  });

  async function persist(): Promise<boolean> {
    setError(null);
    try {
      await save.mutateAsync();
      return true;
    } catch {
      setError("Check the year and try again.");
      return false;
    }
  }

  const thisYear = new Date().getFullYear();

  return (
    <div className="space-y-4">
      <Labeled label="Current year of study" hint="optional">
        <select
          className={fieldClass}
          value={currentYear}
          onChange={(e) => setCurrentYear(e.target.value)}
        >
          <option value="">Select…</option>
          {catalog.currentYears.map((y) => (
            <option key={y.value} value={y.value}>
              {y.label}
            </option>
          ))}
        </select>
      </Labeled>
      <Labeled label="Expected graduation year" hint="optional">
        <input
          type="number"
          inputMode="numeric"
          className={fieldClass}
          value={graduationYear}
          onChange={(e) => setGraduationYear(e.target.value)}
          placeholder={String(thisYear + 1)}
          min={thisYear - 45}
          max={thisYear + 8}
        />
      </Labeled>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <FooterNav
        step={3}
        pending={save.isPending}
        onBack={() => goto(2)}
        onSkip={async () => {
          if (await persist()) goto(4);
        }}
        onNext={async () => {
          if (await persist()) goto(4);
        }}
        onSaveExit={async () => {
          if (await persist()) navigate({ to: "/app" });
        }}
      />
    </div>
  );
}

// --- Step 4: career direction ----------------------------------------------

function Step4({ state, catalog, goto, afterSave, navigate }: StepProps) {
  const [goalStatus, setGoalStatus] = useState(state.careerGoalStatus ?? "");
  const [experienceLevel, setExperienceLevel] = useState(state.experienceLevel ?? "");
  const [selectedCareers, setSelectedCareers] = useState<string[]>(state.targetCareerSlugs);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const showPicker = goalStatus === "known" || goalStatus === "exploring";
  const multi = goalStatus === "exploring";

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, { slug: string; name: string }[]>();
    for (const c of catalog.careers) {
      if (q && !c.name.toLowerCase().includes(q)) continue;
      const list = map.get(c.category) ?? [];
      list.push(c);
      map.set(c.category, list);
    }
    return [...map.entries()];
  }, [catalog.careers, query]);

  function toggleCareer(slug: string) {
    setSelectedCareers((prev) => {
      if (multi) {
        return prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug].slice(0, 5);
      }
      return prev.includes(slug) ? [] : [slug];
    });
  }

  const save = useMutation({
    mutationFn: () =>
      saveOnboardingStep4({
        data: {
          careerGoalStatus: goalStatus as "known" | "exploring" | "unsure",
          experienceLevel: (experienceLevel || undefined) as never,
          targetCareerSlugs: showPicker ? selectedCareers : [],
        },
      }),
    onSuccess: afterSave,
  });

  async function persist(): Promise<boolean> {
    setError(null);
    if (!goalStatus) {
      setError("Pick the option that best describes where you are.");
      return false;
    }
    try {
      await save.mutateAsync();
      return true;
    } catch {
      setError("Couldn't save. Please try again.");
      return false;
    }
  }

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">
          Where are you with your career goal?
        </legend>
        {catalog.careerGoalStatuses.map((g) => (
          <label
            key={g.value}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
              goalStatus === g.value
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40",
            )}
          >
            <input
              type="radio"
              name="goalStatus"
              className="accent-primary"
              checked={goalStatus === g.value}
              onChange={() => {
                setGoalStatus(g.value);
                if (g.value === "unsure") setSelectedCareers([]);
              }}
            />
            {g.label}
          </label>
        ))}
      </fieldset>

      {showPicker && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            {multi ? "Select up to 5 careers you're considering" : "Select your target career"}
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              className="w-full bg-transparent outline-none"
              placeholder="Search careers…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-border p-3">
            {grouped.length === 0 && (
              <p className="text-sm text-muted-foreground">No careers match "{query}".</p>
            )}
            {grouped.map(([category, items]) => (
              <div key={category}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {category}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((c) => (
                    <button
                      key={c.slug}
                      type="button"
                      onClick={() => toggleCareer(c.slug)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        selectedCareers.includes(c.slug)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:border-primary/50",
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {!multi && goalStatus === "known" && selectedCareers.length === 0 && (
            <p className="text-xs text-muted-foreground">
              You can also continue without choosing one now.
            </p>
          )}
        </div>
      )}

      <Labeled label="Career experience level" hint="optional">
        <select
          className={fieldClass}
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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <FooterNav
        step={4}
        pending={save.isPending}
        onBack={() => goto(3)}
        onNext={async () => {
          if (await persist()) goto(5);
        }}
        onSaveExit={async () => {
          if (await persist()) navigate({ to: "/app" });
        }}
      />
    </div>
  );
}

// --- Step 5: review -------------------------------------------------------

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value ?? "—"}</span>
    </div>
  );
}

function Step5({ state, catalog, goto, navigate }: StepProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const finish = useMutation({
    mutationFn: () => finishOnboarding(),
    onSuccess: async () => {
      await router.invalidate();
      toast.success("Profile saved");
      navigate({ to: "/app" });
    },
    onError: () => setError("Add your career-direction answer in step 4, then try again."),
  });

  const degree = state.degree;
  const branch = catalog.branches.find((b) => b.slug === state.branchSlug)?.name;
  const country = catalog.countries.find((c) => c.slug === state.countryCode)?.name;
  const currentYear = catalog.currentYears.find((y) => y.value === state.currentYear)?.label;
  const experience = catalog.experienceLevels.find((x) => x.value === state.experienceLevel)?.label;
  const goal = catalog.careerGoalStatuses.find((g) => g.value === state.careerGoalStatus)?.label;
  const targetCareers = state.targetCareerSlugs
    .map((s) => catalog.careers.find((c) => c.slug === s)?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-4">
      <div className="divide-y divide-border">
        <Row label="Full name" value={state.fullName} />
        <Row label="Degree" value={degree} />
        <Row label="Branch" value={branch} />
        <Row label="College / university" value={state.collegeName} />
        <Row label="Country" value={country} />
        <Row label="Current year" value={currentYear} />
        <Row label="Graduation year" value={state.graduationYear} />
        <Row label="Experience level" value={experience} />
        <Row label="Career goal" value={goal} />
        <Row label="Target career(s)" value={targetCareers || null} />
      </div>

      <p className="text-xs text-muted-foreground">
        Anything blank is optional — you can fill it in later from this page.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => goto(4)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back
        </button>
        <button
          type="button"
          onClick={() => finish.mutate()}
          disabled={finish.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {finish.isPending ? "Saving…" : state.completed ? "Save changes" : "Complete profile"}
          {!finish.isPending && <Check className="size-4" />}
        </button>
      </div>
    </div>
  );
}
