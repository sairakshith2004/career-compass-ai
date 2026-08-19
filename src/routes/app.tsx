import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/worklens/AppShell";

export const Route = createFileRoute("/app")({
  component: AppShell,
});
