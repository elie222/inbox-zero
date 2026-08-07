import type { UIMessage } from "ai";
import type {
  AdvanceOnboardingStageTool,
  UpdateOnboardingSetupTool,
} from "@/utils/ai/onboarding/chat";
import {
  MAX_SETUP_RULES,
  type OnboardingRuleAction,
  type OnboardingSetup,
} from "@/app/api/chat/onboarding/validation";
import { categoryConfig } from "@/utils/category-config";

export type OnboardingChatTools = {
  advanceStage: AdvanceOnboardingStageTool;
  updateSetup: UpdateOnboardingSetupTool;
};

export type OnboardingChatMetadata = {
  // Structured flow events ([panel]/[event] messages) the model needs but the
  // user never typed; filtered out of the rendered conversation.
  hidden?: boolean;
};

// biome-ignore lint/complexity/noBannedTypes: matches assistant chat's ChatMessage pattern
export type OnboardingDataTypes = {};

export type OnboardingChatMessage = UIMessage<
  OnboardingChatMetadata,
  OnboardingDataTypes,
  OnboardingChatTools
>;

export type OnboardingStage =
  | "welcome"
  | "discovery"
  | "guess"
  | "draft"
  | "cleanup"
  | "close";

export const WELCOME_MESSAGE_ID = "onboarding-welcome";

export const WELCOME_MESSAGE =
  "Welcome to Inbox Zero. I'm the assistant that will be running your inbox, so before I touch anything I'd like to understand how you work.\n\nTo start: what do you do?";

export const STAGE_CHIPS: Record<OnboardingStage, string[]> = {
  welcome: [
    "Founder",
    "Sales",
    "Recruiter",
    "Support",
    "Engineer",
    "Something else",
  ],
  discovery: [
    "The sheer volume",
    "I lose threads I owe replies to",
    "Endless cold pitches",
    "Newsletters everywhere",
  ],
  guess: ["Around 50", "About 100", "200 or more", "Honestly no idea"],
  draft: ["Looks good, continue", "What does Cold Email catch?"],
  cleanup: [],
  close: ["Which plan fits me?"],
};

// Canonical question per stage, stored alongside each answer for analysis
export const STAGE_QUESTIONS: Record<OnboardingStage, string> = {
  welcome: "What do you do?",
  discovery: "What's the most painful part of your inbox?",
  guess: "How many emails do you think you get a day?",
  draft: "Any changes to your setup?",
  cleanup: "Which senders should we unsubscribe from?",
  close: "Which plan do you want?",
};

export const STAGE_STEP: Record<OnboardingStage, number> = {
  welcome: 1,
  discovery: 2,
  guess: 3,
  draft: 4,
  cleanup: 5,
  close: 6,
};
export const TOTAL_STEPS = 6;

const STAGE_ORDER: OnboardingStage[] = [
  "welcome",
  "discovery",
  "guess",
  "draft",
  "cleanup",
  "close",
];

export type OnboardingFlow = {
  stage: OnboardingStage;
  setupCardToolCallId: string | null;
  cleanupCardToolCallId: string | null;
};

export function deriveOnboardingFlow(
  messages: OnboardingChatMessage[],
): OnboardingFlow {
  let stage: OnboardingStage = "welcome";
  let setupCardToolCallId: string | null = null;
  let cleanupCardToolCallId: string | null = null;

  for (const message of messages) {
    for (const part of message.parts) {
      if (
        part.type === "tool-advanceStage" &&
        (part.state === "output-available" || part.state === "input-available")
      ) {
        const next = part.input.stage;
        // Guard against out-of-order tool calls: only single forward steps,
        // plus draft -> close when cleanup is skipped. This keeps a confused
        // model from e.g. jumping straight to close and enabling rules early.
        const currentIndex = STAGE_ORDER.indexOf(stage);
        const nextIndex = STAGE_ORDER.indexOf(next);
        const isSkipCleanup = stage === "draft" && next === "close";
        if (nextIndex === currentIndex + 1 || isSkipCleanup) {
          stage = next;
          if (next === "draft") setupCardToolCallId = part.toolCallId;
          if (next === "cleanup") cleanupCardToolCallId = part.toolCallId;
        }
      }
    }
  }

  return { stage, setupCardToolCallId, cleanupCardToolCallId };
}

export function applySetupUpdate(
  setup: OnboardingSetup,
  output: {
    updates: {
      ruleName: string;
      action?: OnboardingRuleAction;
      enabled?: boolean;
    }[];
    addRules: {
      name: string;
      description: string;
      action: OnboardingRuleAction;
    }[];
  },
): OnboardingSetup {
  const rules = setup.rules.map((rule) => {
    const update = output.updates.find(
      (u) => u.ruleName.toLowerCase() === rule.name.toLowerCase(),
    );
    if (!update) return rule;
    return {
      ...rule,
      action: update.action ?? rule.action,
      enabled: update.enabled ?? rule.enabled,
    };
  });

  const seenNames = new Set(rules.map((rule) => rule.name.toLowerCase()));
  const addedRules: OnboardingSetup["rules"] = [];
  for (const rule of output.addRules) {
    if (rules.length + addedRules.length >= MAX_SETUP_RULES) break;
    const lower = rule.name.toLowerCase();
    if (seenNames.has(lower)) continue;
    seenNames.add(lower);
    addedRules.push({
      key: null,
      name: rule.name,
      description: rule.description,
      action: rule.action,
      enabled: true,
      addedByAssistant: true,
    });
  }

  return { ...setup, rules: [...rules, ...addedRules] };
}

export function buildInitialSetup(provider: string): OnboardingSetup {
  return {
    rules: categoryConfig(provider).map((category) => ({
      key: category.key,
      name: category.label,
      description: "",
      action:
        category.action === "label" || category.action === "label_archive"
          ? category.action
          : "move_folder",
      enabled: true,
      addedByAssistant: false,
    })),
    status: "draft",
  };
}
