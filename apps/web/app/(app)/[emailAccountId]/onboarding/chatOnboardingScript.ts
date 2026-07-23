import type { ElementType } from "react";
import { categoryConfig } from "@/utils/category-config";
import { getCategoryAction } from "@/utils/rule/consts";
import { SystemType } from "@/generated/prisma/enums";
import type { IconCircleColor } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";

export type ChatBeatKey =
  | "role"
  | "struggle"
  | "volume"
  | "labels"
  | "labelsTweak"
  | "rules"
  | "rulesTweak"
  | "unsubscribe"
  | "done";

export type ChatAnswers = Partial<Record<ChatBeatKey, string>>;

export const LABELS_TWEAK_CHIP = "Let me tweak these";
export const RULES_TWEAK_CHIP = "Let me adjust them";

// Acknowledgment lines the state machine prepends when the user asked for
// changes we only note down (rather than apply) during onboarding.
export const LABELS_NOTED_MESSAGE =
  "Noted — I'll keep that in mind. You can rename or add labels anytime from Settings.";
export const RULES_NOTED_MESSAGE =
  "Noted — I've saved that. I'll leave the standard rules off so you can finish them from the Assistant tab.";
export const KEEP_NOTED_MESSAGE =
  "Got it — I'll leave them alone. You can run a full cleanup anytime from the Bulk Unsubscribe page.";

type ChatBeat = {
  // Canonical question text stored alongside each answer for later analysis
  question: string;
  messages: (ctx: {
    answers: ChatAnswers;
    unsubscribeCount: number;
    unsubscribedFromCount: number;
    skippedCleanup: boolean;
    setupSucceeded: boolean;
  }) => string[];
  chips?: string[];
  placeholder?: string;
};

export const CHAT_BEATS: Record<ChatBeatKey, ChatBeat> = {
  role: {
    question: "What do you do?",
    messages: () => [
      "Hey — welcome to Inbox Zero. I'm the assistant that'll actually run your email.",
      "Before I set anything up, I want to understand how you work. What do you do?",
    ],
    chips: [
      "Founder",
      "Executive",
      "Sales",
      "Content Creator",
      "Customer Support",
      "Software Engineer",
    ],
    placeholder: "Type your role…",
  },
  struggle: {
    question: "What about your inbox is driving you up the wall?",
    messages: ({ answers }) => [
      `Got it${answers.role ? ` — ${answers.role.toLowerCase()}` : ""}. That shapes a lot.`,
      "So what made you sign up? What's driving you up the wall about your inbox?",
    ],
    chips: [
      "Too many newsletters",
      "I miss important replies",
      "Endless cold emails",
      "I'm too slow to respond",
      "The sheer volume",
    ],
    placeholder: "Tell me in your own words…",
  },
  volume: {
    question: "How much email hits your inbox on a normal day?",
    messages: () => [
      "That's squarely what we fix. Roughly how much email hits your inbox on a normal day?",
    ],
    chips: ["Under 20", "20–50", "50–100", "100+"],
    placeholder: "A rough number is fine…",
  },
  labels: {
    question: "Do these labels look right?",
    messages: () => [
      "Perfect. I've started building your setup — take a look at the panel.",
      "First, labels. I'll auto-apply these to every email as it lands.",
    ],
    chips: ["Looks good", LABELS_TWEAK_CHIP],
    placeholder: "Tell me what you'd change…",
  },
  labelsTweak: {
    question: "What would you change about the labels?",
    messages: () => ["Sure — what would you change?"],
    placeholder: "Rename, add, or remove a label…",
  },
  rules: {
    question: "Should I turn on these automations?",
    messages: () => [
      "Now the automations. These are the rules that make your inbox run itself — I've drafted them in the panel.",
      "Turn them on as-is, or tell me what to change.",
    ],
    chips: ["Turn these on", RULES_TWEAK_CHIP],
    placeholder: "Describe a change in plain English…",
  },
  rulesTweak: {
    question: "What would you change about the rules?",
    messages: () => ["Sure — what would you change?"],
    placeholder: "Describe it in plain English…",
  },
  unsubscribe: {
    question: "Which senders should we unsubscribe from?",
    messages: ({ unsubscribeCount }) => [
      `Last thing: cleanup. You've got ${unsubscribeCount} ${
        unsubscribeCount === 1 ? "sender" : "senders"
      } you barely open.`,
      "I've listed the top ones in the panel — uncheck anything you actually want, then send the rest off.",
    ],
    placeholder: "Or tell me which to keep…",
  },
  done: {
    question: "",
    messages: ({ unsubscribedFromCount, skippedCleanup, setupSucceeded }) => [
      ...(skippedCleanup
        ? [
            "I also checked for newsletter clutter — your inbox looks pretty clean, so nothing to unsubscribe from right now.",
          ]
        : []),
      setupSucceeded
        ? unsubscribedFromCount > 0
          ? `Done — and it's all live. Your inbox is labeled, the rules are running, and ${unsubscribedFromCount} noisy ${
              unsubscribedFromCount === 1 ? "sender is" : "senders are"
            } gone.`
          : "Done — and it's all live. Your inbox is labeled and the rules are running."
        : "I saved what I learned, but your labels and rules aren't on yet. You can finish them from the Assistant tab.",
      "This whole chat also teaches me how you work, so it keeps getting sharper from here.",
    ],
  },
};

// Beats where the artifact panel shows each mode. cleanupPending keeps the
// rules artifact visible while newsletter stats finish loading.
export function getArtifactMode(
  beat: ChatBeatKey | "cleanupPending",
): "idle" | "labels" | "rules" | "unsubscribe" | "summary" {
  switch (beat) {
    case "role":
    case "struggle":
    case "volume":
      return "idle";
    case "labels":
    case "labelsTweak":
      return "labels";
    case "rules":
    case "rulesTweak":
    case "cleanupPending":
      return "rules";
    case "unsubscribe":
      return "unsubscribe";
    case "done":
      return "summary";
  }
}

const WHEN_TEXT: Partial<Record<SystemType, string>> = {
  [SystemType.TO_REPLY]: "an email needs your reply",
  [SystemType.NEWSLETTER]: "a newsletter arrives",
  [SystemType.MARKETING]: "a marketing email arrives",
  [SystemType.CALENDAR]: "a calendar invite or update arrives",
  [SystemType.RECEIPT]: "a receipt or invoice arrives",
  [SystemType.NOTIFICATION]: "an automated notification arrives",
  [SystemType.COLD_EMAIL]: "a cold pitch arrives",
};

export type ChatOnboardingCategory = {
  key: SystemType;
  label: string;
  Icon: ElementType;
  iconColor: IconCircleColor;
  hint: string;
  when: string;
  then: string;
};

// The label set and automations the chat onboarding proposes, derived from the
// same system categories the step-based onboarding creates.
export function getChatOnboardingCategories(
  provider: string,
): ChatOnboardingCategory[] {
  return categoryConfig(provider).map((category) => {
    const action = getCategoryAction(category.key, provider);
    const hint =
      category.key === SystemType.TO_REPLY
        ? "needs you"
        : action === "label"
          ? "kept in inbox"
          : action === "label_archive"
            ? "auto-archived"
            : "filed to folder";
    const then =
      action === "label"
        ? `Label "${category.label}"`
        : action === "label_archive"
          ? `Label "${category.label}" + archive`
          : `Move to "${category.label}" folder`;

    return {
      key: category.key,
      label: category.label,
      Icon: category.Icon,
      iconColor: category.iconColor,
      hint,
      when: WHEN_TEXT[category.key] ?? "a matching email arrives",
      then,
    };
  });
}
