import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Radar,
  ClipboardCheck,
  Route as RouteIcon,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

/** Single source of truth for navigation — sidebar and mobile drawer share it. */
export const NAV_ITEMS: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/jobs", label: "Jobs", icon: Briefcase },
  { to: "/app/resume", label: "Resume", icon: FileText },
  { to: "/app/skills", label: "Skills", icon: Radar },
  { to: "/app/assessments", label: "Assessments", icon: ClipboardCheck },
  { to: "/app/roadmap", label: "Roadmap", icon: RouteIcon },
  { to: "/app/settings", label: "Settings", icon: Settings },
];
