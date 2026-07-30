import {
  CircleCheckBigIcon,
  MailsIcon,
  SettingsIcon,
  ShieldIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { prefixPath } from "@/utils/path";

type App = {
  id: "mail" | "contacts" | "tasks" | "settings" | "admin";
  name: string;
  icon: LucideIcon;
  path: `/${string}`;
  // Lives at a bare path rather than under an email account
  userLevel?: boolean;
  // Only rendered for users in the ADMINS allowlist. Cosmetic: the route and
  // its API are gated server-side regardless.
  adminOnly?: boolean;
};

// The suite's apps, shown in the desktop rail and the mobile bottom tray.
// Grows as Meetings ship.
export const APPS: App[] = [
  { id: "mail", name: "Mail", icon: MailsIcon, path: "/mail" },
  { id: "contacts", name: "Contacts", icon: UsersRoundIcon, path: "/contacts" },
  { id: "tasks", name: "Tasks", icon: CircleCheckBigIcon, path: "/tasks" },
  {
    id: "settings",
    name: "Settings",
    icon: SettingsIcon,
    path: "/settings",
    userLevel: true,
  },
  {
    id: "admin",
    name: "Admin",
    icon: ShieldIcon,
    path: "/admin",
    userLevel: true,
    adminOnly: true,
  },
];

export type AppId = App["id"];

export function getActiveAppId(path: string): AppId | null {
  if (path.includes("/contacts")) return "contacts";
  if (path.includes("/tasks")) return "tasks";
  if (path.includes("/settings")) return "settings";
  if (path.includes("/admin")) return "admin";
  if (path.includes("/mail") || path.includes("/compose")) return "mail";
  return null;
}

export function getAppHref(emailAccountId: string, app: App) {
  return app.userLevel ? app.path : prefixPath(emailAccountId, app.path);
}

export function getVisibleApps({ isAdmin }: { isAdmin: boolean }) {
  return APPS.filter((app) => !app.adminOnly || isAdmin);
}
