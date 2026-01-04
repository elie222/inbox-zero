import type { LucideIcon } from "lucide-react";

export type CommandSection =
  | "actions"
  | "navigation"
  | "rules"
  | "accounts"
  | "settings";

export interface Command {
  id: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
  keywords?: string[];
  shortcut?: string;
  section: CommandSection;
  priority?: number;
  action: () => void | Promise<void>;
}
