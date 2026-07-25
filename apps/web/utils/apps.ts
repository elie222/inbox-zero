import {
  CircleCheckBigIcon,
  MailsIcon,
  SettingsIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { prefixPath } from "@/utils/path";

// The suite's apps, shown in the desktop rail and the mobile bottom tray.
// Grows as Meetings ship.
export const APPS: Array<{
  id: "mail" | "contacts" | "tasks" | "settings";
  name: string;
  icon: LucideIcon;
  path: `/${string}`;
}> = [
  { id: "mail", name: "Mail", icon: MailsIcon, path: "/mail" },
  { id: "contacts", name: "Contacts", icon: UsersRoundIcon, path: "/contacts" },
  { id: "tasks", name: "Tasks", icon: CircleCheckBigIcon, path: "/tasks" },
  { id: "settings", name: "Settings", icon: SettingsIcon, path: "/settings" },
];

export type AppId = (typeof APPS)[number]["id"];

export function getActiveAppId(path: string): AppId | null {
  if (path.includes("/contacts")) return "contacts";
  if (path.includes("/tasks")) return "tasks";
  if (path.includes("/settings")) return "settings";
  if (path.includes("/mail") || path.includes("/compose")) return "mail";
  return null;
}

// Settings is user-level and lives at a bare path; account apps get prefixed
export function getAppHref(emailAccountId: string, app: (typeof APPS)[number]) {
  return app.id === "settings"
    ? app.path
    : prefixPath(emailAccountId, app.path);
}
