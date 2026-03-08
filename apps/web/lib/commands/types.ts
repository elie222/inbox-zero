import type { LucideIcon } from "lucide-react";

export type CommandSection =
  | "actions"
  | "navigation"
  | "rules"
  | "accounts"
  | "settings";

export interface Command {
  action: () => void | Promise<void>;
  description?: string;
  icon?: LucideIcon;
  id: string;
  keywords?: string[];
  label: string;
  priority?: number;
  section: CommandSection;
  shortcut?: string;
}
