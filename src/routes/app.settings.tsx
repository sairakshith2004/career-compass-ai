import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Panel } from "@/components/worklens/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { getCurrentUser, getPreferences, updatePreferences } from "@/lib/server-fns";

export const Route = createFileRoute("/app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — WorkLens" },
      {
        name: "description",
        content: "Manage your WorkLens profile, target role and weekly learning capacity.",
      },
      { property: "og:title", content: "Settings — WorkLens" },
      {
        property: "og:description",
        content: "Profile, target role and learning preferences.",
      },
    ],
  }),
  loader: async () => {
    const [user, preferences] = await Promise.all([getCurrentUser(), getPreferences()]);
    return { user, preferences };
  },
  component: Settings,
});

function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="text-sm text-muted-foreground">{label}</span>
      <input
        disabled
        defaultValue={value}
        className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
      />
    </label>
  );
}

// The <input type="number"> reports a string, so the form works in strings end-to-end and
// only converts to a number right before it hits the (identically-shaped) server schema.
const preferencesSchema = z.object({
  targetRole: z.string().trim().min(1, "Target role is required").max(120),
  weeklyStudyHours: z
    .string()
    .trim()
    .min(1, "Required")
    .refine((v) => /^\d+$/.test(v), "Whole hours only")
    .refine((v) => Number(v) >= 1 && Number(v) <= 80, "Must be between 1 and 80 hours"),
});

type PreferencesFormValues = z.infer<typeof preferencesSchema>;

function PreferencesForm({
  preferences,
}: {
  preferences: { targetRole: string | null; weeklyStudyHours: number | null } | null;
}) {
  const router = useRouter();
  const form = useForm<PreferencesFormValues>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: {
      targetRole: preferences?.targetRole ?? "",
      weeklyStudyHours: String(preferences?.weeklyStudyHours ?? 10),
    },
  });

  // Keep the form in sync if the loader data changes (e.g. after navigating back).
  useEffect(() => {
    form.reset({
      targetRole: preferences?.targetRole ?? "",
      weeklyStudyHours: String(preferences?.weeklyStudyHours ?? 10),
    });
  }, [preferences, form]);

  const mutation = useMutation({
    mutationFn: (values: PreferencesFormValues) =>
      updatePreferences({
        data: { targetRole: values.targetRole, weeklyStudyHours: Number(values.weeklyStudyHours) },
      }),
    onSuccess: async () => {
      toast.success("Career preferences saved");
      await router.invalidate();
    },
    onError: () => {
      toast.error("Couldn't save preferences — try again");
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <FormField
          control={form.control}
          name="targetRole"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm text-muted-foreground">Target role</FormLabel>
              <FormControl>
                <Input placeholder="Backend / AI Engineer" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="weeklyStudyHours"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm text-muted-foreground">Weekly study hours</FormLabel>
              <FormControl>
                <Input type="number" min={1} max={80} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save preferences"}
        </Button>
      </form>
    </Form>
  );
}

function DangerZone() {
  const [confirming, setConfirming] = useState(false);

  return (
    <Panel title="Danger zone" className="border-destructive/30">
      <p className="text-sm text-muted-foreground">
        Deleting your account will permanently remove all your data including resumes, skills,
        assessments, roadmaps, and job applications. This action cannot be undone.
      </p>
      <div className="mt-4">
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="rounded-lg border border-destructive/50 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/5"
         >
            Delete account
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-destructive">
              Are you sure? This cannot be undone.
            </p>
            <button
              onClick={() => {
                /* TODO: implement account deletion */
                toast.error("Account deletion is not yet implemented.");
                setConfirming(false);
              }}
              className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90"
            >
              Yes, delete my account
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </Panel>
  );
}

function Settings() {
  const { user, preferences } = Route.useLoaderData();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel
        title="Profile"
        description={
          user
            ? "Synced from your login provider. Editing lands with the profile API."
            : "You're browsing without an account."
        }
      >
        {user ? (
          <div className="space-y-4">
            <Field label="Full name" value={user.name} />
            <Field label="Email" value={user.email} />
          </div>
        ) : (
          <Link
            to="/login"
            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Sign in to see your profile
          </Link>
        )}
      </Panel>
      <Panel title="Career preferences" description="Used to tailor your roadmap and job matches.">
        {user ? (
          <PreferencesForm preferences={preferences} />
        ) : (
          <p className="text-sm text-muted-foreground">Sign in to configure your preferences.</p>
        )}
      </Panel>

      {/* Danger zone */}
      {user && <DangerZone />}
    </div>
  );
}
