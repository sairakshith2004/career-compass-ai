import { createFileRoute } from "@tanstack/react-router";
import { Panel } from "@/components/worklens/Panel";

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

function Settings() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Profile" description="Editable once authentication lands in Phase 3.">
        <div className="space-y-4">
          <Field label="Full name" value="Sai Rakshith" />
          <Field label="Email" value="you@example.com" />
        </div>
      </Panel>
      <Panel title="Career preferences">
        <div className="space-y-4">
          <Field label="Target role" value="Backend / AI Engineer" />
          <Field label="Weekly study hours" value="10" />
        </div>
      </Panel>
    </div>
  );
}
