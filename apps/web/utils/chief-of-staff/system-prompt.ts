import fs from "node:fs";
import path from "node:path";
import { AutonomyMode, type CosCategory, Venture } from "./types";

interface PromptParams {
  autonomyLevels: Record<CosCategory, AutonomyMode>;
  currentDateTime: string;
  venture: Venture;
  voiceTone: string;
}

let basePromptCache: string | null = null;

function getBasePrompt(): string {
  if (basePromptCache) return basePromptCache;
  const promptPath = path.join(process.cwd(), "config", "system-prompt.md");
  basePromptCache = fs.readFileSync(promptPath, "utf-8");
  return basePromptCache;
}

const VENTURE_NAMES: Record<Venture, string> = {
  [Venture.SMART_COLLEGE]: "Smart College",
  [Venture.PRAXIS]: "Praxis Education",
  [Venture.PERSONAL]: "Personal",
};

export function buildSystemPrompt(params: PromptParams): string {
  const base = getBasePrompt();

  const dynamicSections = [
    "---",
    "## Runtime Context (injected per email)",
    "",
    `**Current date/time:** ${params.currentDateTime} (America/Chicago)`,
    `**Responding as:** ${VENTURE_NAMES[params.venture]}`,
    `**Voice/Tone:** ${params.voiceTone}`,
    "",
    "### Autonomy Levels",
    ...Object.entries(params.autonomyLevels).map(
      ([cat, mode]) => `- **${cat}:** ${formatMode(mode)}`,
    ),
    "",
    "### Day Protection Rules",
    "- Tuesday is a protected recovery day — never suggest tutoring on Tuesdays, no override allowed.",
    "- Friday is a protected non-tutoring day — only suggest Friday tutoring for VIP clients (5+ past bookings).",
    "",
    "### Same-Day Escalation",
    "- If someone requests a tutoring session for today or tomorrow, escalate to Urgent category regardless of other factors.",
    "",
    "### Autonomy Mode Definitions",
    "- **auto_handle:** Execute the action immediately. Report what you did.",
    "- **draft_approve:** Create a Gmail draft and report it. Do NOT send.",
    "- **flag_only:** Do NOT take any action or draft. Just report the situation.",
  ];

  return `${base}\n\n${dynamicSections.join("\n")}`;
}

function formatMode(mode: AutonomyMode): string {
  switch (mode) {
    case AutonomyMode.AUTO_HANDLE:
      return "Auto-Handle (execute and report)";
    case AutonomyMode.DRAFT_APPROVE:
      return "Draft + Approve (draft, wait for approval)";
    case AutonomyMode.FLAG_ONLY:
      return "Flag Only (never auto-handle, always escalate)";
  }
}
