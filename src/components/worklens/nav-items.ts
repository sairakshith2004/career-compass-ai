import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Radar,
  ClipboardCheck,
  Route as RouteIcon,
  Settings,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** True for sections whose data is resume-derived — locked until a resume is uploaded
   * (enforced by `requireResume` in each route's `beforeLoad`; see route-guards.ts). */
  gated?: boolean;
};

/** Single source of truth for navigation — sidebar and mobile drawer share it. */
export const NAV_ITEMS: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/onboarding", label: "Profile", icon: GraduationCap },
  { to: "/app/jobs", label: "Jobs", icon: Briefcase, gated: true },
  { to: "/app/resume", label: "Resume", icon: FileText },
  { to: "/app/skills", label: "Skills", icon: Radar, gated: true },
  { to: "/app/assessments", label: "Assessments", icon: ClipboardCheck, gated: true },
  { to: "/app/roadmap", label: "Roadmap", icon: RouteIcon, gated: true },
  { to: "/app/settings", label: "Settings", icon: Settings },
];
