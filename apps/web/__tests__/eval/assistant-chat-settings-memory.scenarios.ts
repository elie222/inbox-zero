import type { ModelMessage } from "ai";

export type AssistantSettingsChangeExpectation = {
  path: string;
  value: unknown;
  mode?: "append" | "replace";
};

export type SettingsMemoryScenarioExpectation =
  | {
      kind: "capability_discovery";
    }
  | {
      kind: "assistant_settings";
      changes: AssistantSettingsChangeExpectation[];
      forbiddenTools: string[];
      requiredCapabilities?: string[];
    }
  | {
      kind: "personal_instructions";
      mode: "append" | "replace";
      semanticExpectation: string;
    }
  | {
      kind: "save_memory";
      forbiddenTools: string[];
      expectedContent: string;
      expectedUserEvidence: string;
    }
  | {
      kind: "search_memories";
      forbiddenTools: string[];
      semanticExpectation?: string;
      allowEmptyQuery?: boolean;
      requireEmptyQuery?: boolean;
    }
  | {
      kind: "assistant_settings_and_save_memory";
      changes: AssistantSettingsChangeExpectation[];
      expectedContent: string;
      expectedUserEvidence: string;
      forbiddenTools: string[];
      requiredCapabilities: string[];
    }
  | {
      kind: "save_then_search_memories";
      expectedContent: string;
      expectedUserEvidence: string;
      semanticExpectation?: string;
      allowEmptyQuery?: boolean;
      requireEmptyQuery?: boolean;
      forbiddenTools: string[];
    };

export type SettingsMemoryScenario = {
  id: string;
  title: string;
  reportName: string;
  category:
    | "capability_discovery"
    | "assistant_settings"
    | "personal_instructions"
    | "save_memory"
    | "search_memories"
    | "combined_write";
  shape: "single_turn" | "multi_turn";
  realWorldSeed: "db-inspired" | "synthetic-gap";
  crossModelCanary?: boolean;
  prompt?: string;
  messages?: ModelMessage[];
  timeout?: number;
  expectation: SettingsMemoryScenarioExpectation;
};

const settingsMemoryScenariosRaw: SettingsMemoryScenario[] = [
  {
    id: "capability-discovery",
    title: "uses getAssistantCapabilities for capability discovery requests",
    reportName: "capability discovery uses getAssistantCapabilities",
    category: "capability_discovery",
    shape: "single_turn",
    realWorldSeed: "synthetic-gap",
    prompt: "What settings can you change for me from chat?",
    expectation: {
      kind: "capability_discovery",
    },
  },
  {
    id: "direct-multi-rule-enable",
    title: "uses updateAssistantSettings for supported setting changes",
    reportName: "supported settings change uses updateAssistantSettings",
    category: "assistant_settings",
    shape: "single_turn",
    realWorldSeed: "synthetic-gap",
    crossModelCanary: true,
    prompt: "Turn on multi-rule selection for me.",
    expectation: {
      kind: "assistant_settings",
      changes: [
        {
          path: "assistant.multiRuleSelection.enabled",
          value: true,
        },
      ],
      forbiddenTools: ["updateAssistantSettingsCompat"],
      requiredCapabilities: ["settings"],
    },
  },
  {
    id: "batched-briefs-and-filing",
    title:
      "uses structured updateAssistantSettings changes for multi-setting writes",
    reportName: "multi-setting change uses structured updateAssistantSettings",
    category: "assistant_settings",
    shape: "single_turn",
    realWorldSeed: "synthetic-gap",
    crossModelCanary: true,
    prompt:
      "Turn on meeting briefs and auto-file attachments for me in one go.",
    expectation: {
      kind: "assistant_settings",
      changes: [
        {
          path: "assistant.meetingBriefs.enabled",
          value: true,
        },
        {
          path: "assistant.attachmentFiling.enabled",
          value: true,
        },
      ],
      forbiddenTools: ["updateAssistantSettingsCompat"],
      requiredCapabilities: ["settings"],
    },
  },
  {
    id: "disable-meeting-briefs",
    title: "uses updateAssistantSettings for disabling meeting briefs",
    reportName: "disable meeting briefs uses updateAssistantSettings",
    category: "assistant_settings",
    shape: "single_turn",
    realWorldSeed: "synthetic-gap",
    prompt: "Turn off meeting briefs for me.",
    expectation: {
      kind: "assistant_settings",
      changes: [
        {
          path: "assistant.meetingBriefs.enabled",
          value: false,
        },
      ],
      forbiddenTools: ["updateAssistantSettingsCompat"],
      requiredCapabilities: ["settings"],
    },
  },
  {
    id: "meeting-brief-timing",
    title: "uses updateAssistantSettings for meeting brief timing changes",
    reportName: "meeting brief timing uses updateAssistantSettings",
    category: "assistant_settings",
    shape: "single_turn",
    realWorldSeed: "synthetic-gap",
    prompt: "Set meeting briefs to 30 minutes before the meeting.",
    expectation: {
      kind: "assistant_settings",
      changes: [
        {
          path: "assistant.meetingBriefs.minutesBefore",
          value: 30,
        },
      ],
      forbiddenTools: ["updateAssistantSettingsCompat"],
      requiredCapabilities: ["settings"],
    },
  },
  {
    id: "meeting-brief-email-delivery",
    title: "uses updateAssistantSettings for meeting briefs email delivery",
    reportName: "meeting briefs email delivery uses updateAssistantSettings",
    category: "assistant_settings",
    shape: "single_turn",
    realWorldSeed: "synthetic-gap",
    prompt: "Email me the meeting briefs too.",
    expectation: {
      kind: "assistant_settings",
      changes: [
        {
          path: "assistant.meetingBriefs.sendEmail",
          value: true,
        },
      ],
      forbiddenTools: ["updateAssistantSettingsCompat"],
      requiredCapabilities: ["settings"],
    },
  },
  {
    id: "disable-attachment-filing",
    title: "uses updateAssistantSettings for disabling attachment filing",
    reportName: "disable attachment filing uses updateAssistantSettings",
    category: "assistant_settings",
    shape: "single_turn",
    realWorldSeed: "synthetic-gap",
    prompt: "Turn off auto-file attachments for me.",
    expectation: {
      kind: "assistant_settings",
      changes: [
        {
          path: "assistant.attachmentFiling.enabled",
          value: false,
        },
      ],
      forbiddenTools: ["updateAssistantSettingsCompat"],
      requiredCapabilities: ["settings"],
    },
  },
  {
    id: "personal-instructions-append-concise",
    title:
      "uses updatePersonalInstructions in append mode for personal instruction updates",
    reportName: "personal instructions use updatePersonalInstructions append",
    category: "personal_instructions",
    shape: "single_turn",
    realWorldSeed: "synthetic-gap",
    crossModelCanary: true,
    prompt: "Add to my personal instructions that I prefer concise replies.",
    expectation: {
      kind: "personal_instructions",
      mode: "append",
      semanticExpectation:
        "Updated personal instructions that remember the user's preference for concise replies.",
    },
  },
  {
    id: "personal-instructions-replace-explicit",
    title:
      "uses updatePersonalInstructions in replace mode for explicit overwrite requests",
    reportName: "personal instructions explicit overwrite uses replace mode",
    category: "personal_instructions",
    shape: "single_turn",
    realWorldSeed: "synthetic-gap",
    prompt:
      "Replace my personal instructions with: use short bullet points and skip greetings.",
    expectation: {
      kind: "personal_instructions",
      mode: "replace",
      semanticExpectation:
        "Updated personal instructions that explicitly replace prior instructions with short bullet points and no greeting.",
    },
  },
  {
    id: "personal-instructions-brutally-formal",
    title:
      "uses updatePersonalInstructions for terse style preferences from real phrasing",
    reportName: "terse style preference uses updatePersonalInstructions append",
    category: "personal_instructions",
    shape: "single_turn",
    realWorldSeed: "db-inspired",
    prompt: "Remember: brutally formal tone for future replies.",
    expectation: {
      kind: "personal_instructions",
      mode: "append",
      semanticExpectation:
        "Updated personal instructions that store the user's preference for a brutally formal tone in future replies.",
    },
  },
  {
    id: "save-memory-newsletter-afternoon",
    title: "uses saveMemory when asked to remember a durable preference",
    reportName: "remember preference uses saveMemory",
    category: "save_memory",
    shape: "single_turn",
    realWorldSeed: "db-inspired",
    crossModelCanary: true,
    prompt: "Remember that I like batching newsletters in the afternoon.",
    timeout: 120_000,
    expectation: {
      kind: "save_memory",
      forbiddenTools: ["searchMemories"],
      expectedContent: "I like batching newsletters in the afternoon.",
      expectedUserEvidence: "I like batching newsletters in the afternoon.",
    },
  },
  {
    id: "save-memory-newsletter-grouping",
    title: "uses saveMemory for grouping newsletters preferences",
    reportName: "group newsletter preference uses saveMemory",
    category: "save_memory",
    shape: "single_turn",
    realWorldSeed: "db-inspired",
    prompt: "Remember that I like newsletters grouped together for review.",
    timeout: 120_000,
    expectation: {
      kind: "save_memory",
      forbiddenTools: ["searchMemories"],
      expectedContent: "I like newsletters grouped together for review.",
      expectedUserEvidence: "I like newsletters grouped together for review.",
    },
  },
  {
    id: "search-memories-newsletter",
    title: "uses searchMemories when asked about remembered preferences",
    reportName: "memory lookup uses searchMemories",
    category: "search_memories",
    shape: "single_turn",
    realWorldSeed: "synthetic-gap",
    prompt: "What do you remember about my newsletter preferences?",
    expectation: {
      kind: "search_memories",
      forbiddenTools: ["saveMemory"],
      semanticExpectation:
        "A memory search query that looks up what the assistant knows about the user's newsletter preferences.",
    },
  },
  {
    id: "search-memories-cross-thread",
    title: "uses searchMemories for cross-thread memory requests",
    reportName: "cross-thread memory lookup uses searchMemories",
    category: "search_memories",
    shape: "single_turn",
    realWorldSeed: "db-inspired",
    prompt: "Do you remember our conversations from other threads?",
    expectation: {
      kind: "search_memories",
      forbiddenTools: ["saveMemory"],
      semanticExpectation:
        "A memory search query that looks up prior conversations or saved context from other chat threads.",
      allowEmptyQuery: true,
    },
  },
  {
    id: "followup-capability-to-settings",
    title:
      "uses updateAssistantSettings after a capability discussion follow-up",
    reportName: "capability follow-up still writes supported settings",
    category: "assistant_settings",
    shape: "multi_turn",
    realWorldSeed: "synthetic-gap",
    messages: [
      {
        role: "user",
        content: "What settings can you change for me from chat?",
      },
      {
        role: "assistant",
        content:
          "I can change some assistant settings from chat, including supported account preferences.",
      },
      {
        role: "user",
        content: "Ok then turn on multi-rule selection for me.",
      },
    ],
    expectation: {
      kind: "assistant_settings",
      changes: [
        {
          path: "assistant.multiRuleSelection.enabled",
          value: true,
        },
      ],
      forbiddenTools: ["updateAssistantSettingsCompat"],
      requiredCapabilities: ["settings"],
    },
  },
  {
    id: "followup-refine-meeting-briefs",
    title:
      "uses structured updateAssistantSettings for a follow-up refinement flow",
    reportName: "follow-up refinement batches meeting brief changes",
    category: "assistant_settings",
    shape: "multi_turn",
    realWorldSeed: "db-inspired",
    messages: [
      {
        role: "user",
        content: "Turn on meeting briefs for me.",
      },
      {
        role: "assistant",
        content: "I can do that.",
      },
      {
        role: "user",
        content:
          "Actually make them 30 minutes before and email them to me too.",
      },
    ],
    expectation: {
      kind: "assistant_settings",
      changes: [
        {
          path: "assistant.meetingBriefs.minutesBefore",
          value: 30,
        },
        {
          path: "assistant.meetingBriefs.sendEmail",
          value: true,
        },
      ],
      forbiddenTools: ["updateAssistantSettingsCompat"],
      requiredCapabilities: ["settings"],
    },
  },
  {
    id: "followup-move-tone-to-instructions",
    title:
      "uses updatePersonalInstructions when the user explicitly moves a remembered tone into instructions",
    reportName: "remember tone follow-up uses personal instructions",
    category: "personal_instructions",
    shape: "multi_turn",
    realWorldSeed: "db-inspired",
    messages: [
      {
        role: "user",
        content: "Remember: informal tone",
      },
      {
        role: "assistant",
        content:
          "I can keep that in mind for this conversation. If you want, I can store it for future replies too.",
      },
      {
        role: "user",
        content:
          "Yes, add that to my personal instructions for future replies.",
      },
    ],
    expectation: {
      kind: "personal_instructions",
      mode: "append",
      semanticExpectation:
        "Updated personal instructions that store the user's preference for an informal tone in future replies.",
    },
  },
  {
    id: "followup-schedule-pref-memory-lookup",
    title:
      "uses searchMemories for a follow-up about remembered report schedule preferences",
    reportName: "follow-up report schedule memory lookup uses searchMemories",
    category: "search_memories",
    shape: "multi_turn",
    realWorldSeed: "db-inspired",
    messages: [
      {
        role: "user",
        content: "Remember that I only want check-ins on weekdays.",
      },
      {
        role: "assistant",
        content: "I can remember that for future chats.",
      },
      {
        role: "user",
        content: "What do you remember about my report schedule preferences?",
      },
    ],
    expectation: {
      kind: "search_memories",
      forbiddenTools: ["saveMemory"],
      semanticExpectation:
        "A memory search query that looks up the user's saved preferences about report or check-in scheduling.",
    },
  },
  {
    id: "cross-thread-rules-followup",
    title:
      "uses searchMemories before a follow-up that references prior conversations",
    reportName: "cross-thread deletion follow-up first checks memories",
    category: "search_memories",
    shape: "multi_turn",
    realWorldSeed: "db-inspired",
    messages: [
      {
        role: "user",
        content:
          "Hi there! Do you remember our conversations from other threads?",
      },
      {
        role: "assistant",
        content:
          "I can look up stored context from previous chats when needed.",
      },
      {
        role: "user",
        content:
          "If you remember the rules, what do you know about what should count as newsletter versus deletion?",
      },
    ],
    expectation: {
      kind: "search_memories",
      forbiddenTools: ["saveMemory"],
      semanticExpectation:
        "A memory search query that looks up prior rules or saved context about newsletter versus deletion preferences from previous conversations.",
    },
  },
  {
    id: "future-reply-tone-default",
    title:
      "uses updatePersonalInstructions for an explicit future-reply tone request from real phrasing",
    reportName: "future reply tone request uses personal instructions",
    category: "personal_instructions",
    shape: "multi_turn",
    realWorldSeed: "db-inspired",
    messages: [
      {
        role: "user",
        content:
          "Send an email to someone about any random topic. Ask a question. Talk a little. Remember: brutally formal",
      },
      {
        role: "assistant",
        content: "I can write in a brutally formal tone for this reply.",
      },
      {
        role: "user",
        content: "Also make that my default tone for future replies.",
      },
    ],
    expectation: {
      kind: "personal_instructions",
      mode: "append",
      semanticExpectation:
        "Updated personal instructions that store the user's preference for a brutally formal default tone in future replies.",
    },
  },
  {
    id: "disable-meeting-brief-emails",
    title: "uses updateAssistantSettings to turn off meeting brief emails",
    reportName: "disable meeting brief emails uses updateAssistantSettings",
    category: "assistant_settings",
    shape: "single_turn",
    realWorldSeed: "synthetic-gap",
    prompt: "Turn off the email delivery for meeting briefs.",
    expectation: {
      kind: "assistant_settings",
      changes: [
        {
          path: "assistant.meetingBriefs.sendEmail",
          value: false,
        },
      ],
      forbiddenTools: ["updateAssistantSettingsCompat"],
      requiredCapabilities: ["settings"],
    },
  },
  {
    id: "enable-briefs-and-email-batched",
    title:
      "uses one batched write to turn on meeting briefs and their email delivery",
    reportName: "batched meeting briefs enable and email delivery",
    category: "assistant_settings",
    shape: "single_turn",
    realWorldSeed: "synthetic-gap",
    prompt: "Turn on meeting briefs and email them to me too.",
    expectation: {
      kind: "assistant_settings",
      changes: [
        {
          path: "assistant.meetingBriefs.enabled",
          value: true,
        },
        {
          path: "assistant.meetingBriefs.sendEmail",
          value: true,
        },
      ],
      forbiddenTools: ["updateAssistantSettingsCompat"],
      requiredCapabilities: ["settings"],
    },
  },
  {
    id: "change-timing-and-disable-email",
    title:
      "uses one batched write to change meeting brief timing and disable emails",
    reportName: "batched meeting brief timing and email disable",
    category: "assistant_settings",
    shape: "single_turn",
    realWorldSeed: "synthetic-gap",
    prompt: "Set meeting briefs to 45 minutes before and stop emailing them.",
    expectation: {
      kind: "assistant_settings",
      changes: [
        {
          path: "assistant.meetingBriefs.minutesBefore",
          value: 45,
        },
        {
          path: "assistant.meetingBriefs.sendEmail",
          value: false,
        },
      ],
      forbiddenTools: ["updateAssistantSettingsCompat"],
      requiredCapabilities: ["settings"],
    },
  },
  {
    id: "enable-filing-and-set-prompt",
    title:
      "uses one batched write to enable attachment filing and set its prompt",
    reportName: "enable attachment filing and set prompt",
    category: "assistant_settings",
    shape: "single_turn",
    realWorldSeed: "db-inspired",
    prompt:
      "Turn on attachment filing and use this prompt: file contracts to the agreements folder and receipts to finance.",
    expectation: {
      kind: "assistant_settings",
      changes: [
        {
          path: "assistant.attachmentFiling.enabled",
          value: true,
        },
        {
          path: "assistant.attachmentFiling.prompt",
          value:
            "file contracts to the agreements folder and receipts to finance.",
        },
      ],
      forbiddenTools: ["updateAssistantSettingsCompat"],
      requiredCapabilities: ["settings"],
    },
  },
  {
    id: "disable-filing-and-clear-prompt",
    title:
      "uses one batched write to disable attachment filing and clear its prompt",
    reportName: "disable attachment filing and clear prompt",
    category: "assistant_settings",
    shape: "single_turn",
    realWorldSeed: "synthetic-gap",
    prompt: "Turn off attachment filing and clear the filing prompt.",
    expectation: {
      kind: "assistant_settings",
      changes: [
        {
          path: "assistant.attachmentFiling.enabled",
          value: false,
        },
        {
          path: "assistant.attachmentFiling.prompt",
          value: null,
        },
      ],
      forbiddenTools: ["updateAssistantSettingsCompat"],
      requiredCapabilities: ["settings"],
    },
  },
  {
    id: "clear-filing-prompt-only",
    title: "uses updateAssistantSettings to clear only the filing prompt",
    reportName: "clear attachment filing prompt only",
    category: "assistant_settings",
    shape: "single_turn",
    realWorldSeed: "synthetic-gap",
    prompt: "Keep attachment filing on, but clear the filing prompt.",
    expectation: {
      kind: "assistant_settings",
      changes: [
        {
          path: "assistant.attachmentFiling.prompt",
          value: null,
        },
      ],
      forbiddenTools: ["updateAssistantSettingsCompat"],
      requiredCapabilities: ["settings"],
    },
  },
  {
    id: "batch-disable-multirule-enable-briefs",
    title:
      "uses one batched write to disable multi-rule selection and enable meeting briefs",
    reportName: "disable multi-rule selection and enable meeting briefs",
    category: "assistant_settings",
    shape: "single_turn",
    realWorldSeed: "db-inspired",
    prompt:
      "Turn off multi-rule selection and turn on meeting briefs in one go.",
    expectation: {
      kind: "assistant_settings",
      changes: [
        {
          path: "assistant.multiRuleSelection.enabled",
          value: false,
        },
        {
          path: "assistant.meetingBriefs.enabled",
          value: true,
        },
      ],
      forbiddenTools: ["updateAssistantSettingsCompat"],
      requiredCapabilities: ["settings"],
    },
  },
  {
    id: "followup-brief-email-correction",
    title:
      "uses a direct supported write for a follow-up correction that only adds brief emails",
    reportName: "follow-up correction enables brief email delivery",
    category: "assistant_settings",
    shape: "multi_turn",
    realWorldSeed: "db-inspired",
    messages: [
      {
        role: "user",
        content: "Turn on meeting briefs.",
      },
      {
        role: "assistant",
        content: "Done. Meeting briefs are enabled.",
      },
      {
        role: "user",
        content: "Actually email the briefs too.",
      },
    ],
    expectation: {
      kind: "assistant_settings",
      changes: [
        {
          path: "assistant.meetingBriefs.sendEmail",
          value: true,
        },
      ],
      forbiddenTools: [
        "updateAssistantSettingsCompat",
        "getAssistantCapabilities",
      ],
      requiredCapabilities: ["settings"],
    },
  },
  {
    id: "followup-email-only-not-timing",
    title:
      "uses a direct supported write when a follow-up correction only changes email delivery",
    reportName: "follow-up correction changes only brief email delivery",
    category: "assistant_settings",
    shape: "multi_turn",
    realWorldSeed: "db-inspired",
    messages: [
      {
        role: "user",
        content: "Set meeting briefs to 20 minutes before meetings.",
      },
      {
        role: "assistant",
        content: "I can do that.",
      },
      {
        role: "user",
        content: "No, only email delivery. Do not change the timing.",
      },
    ],
    expectation: {
      kind: "assistant_settings",
      changes: [
        {
          path: "assistant.meetingBriefs.sendEmail",
          value: true,
        },
      ],
      forbiddenTools: [
        "updateAssistantSettingsCompat",
        "getAssistantCapabilities",
      ],
      requiredCapabilities: ["settings"],
    },
  },
  {
    id: "unsupported-report-schedule-phrasing",
    title:
      "uses getAssistantCapabilities instead of inventing writes for unsupported schedule phrasing",
    reportName: "unsupported schedule phrasing uses capability discovery",
    category: "capability_discovery",
    shape: "single_turn",
    realWorldSeed: "db-inspired",
    prompt: "Set up a noon report and a 4:45 report every day.",
    expectation: {
      kind: "capability_discovery",
    },
  },
  {
    id: "scheduled-checkins-enable-after-capabilities",
    title:
      "uses updateAssistantSettings for scheduled check-ins after capability context exists",
    reportName: "scheduled check-ins enable after capability context",
    category: "assistant_settings",
    shape: "multi_turn",
    realWorldSeed: "db-inspired",
    messages: [
      {
        role: "user",
        content: "What can you change about scheduled check-ins from chat?",
      },
      {
        role: "assistant",
        content:
          "I can update scheduled check-ins when the destination context is already known.",
      },
      {
        role: "user",
        content:
          "Ok, enable scheduled check-ins with the existing schedule and prompt.",
      },
    ],
    expectation: {
      kind: "assistant_settings",
      changes: [
        {
          path: "assistant.scheduledCheckIns.config",
          value: {
            enabled: true,
          },
        },
      ],
      forbiddenTools: ["updateAssistantSettingsCompat"],
      requiredCapabilities: ["settings"],
    },
  },
  {
    id: "scheduled-checkins-disable",
    title: "uses updateAssistantSettings to disable scheduled check-ins",
    reportName: "scheduled check-ins disable uses updateAssistantSettings",
    category: "assistant_settings",
    shape: "single_turn",
    realWorldSeed: "synthetic-gap",
    prompt: "Disable scheduled check-ins.",
    expectation: {
      kind: "assistant_settings",
      changes: [
        {
          path: "assistant.scheduledCheckIns.config",
          value: {
            enabled: false,
          },
        },
      ],
      forbiddenTools: ["updateAssistantSettingsCompat"],
      requiredCapabilities: ["settings"],
    },
  },
  {
    id: "draft-kb-create",
    title: "uses updateAssistantSettings to create a draft knowledge base item",
    reportName: "draft knowledge base create uses upsert",
    category: "assistant_settings",
    shape: "single_turn",
    realWorldSeed: "db-inspired",
    prompt:
      "Create a draft knowledge base note called Reply style with: Use concise bullet points.",
    expectation: {
      kind: "assistant_settings",
      changes: [
        {
          path: "assistant.draftKnowledgeBase.upsert",
          value: {
            title: "Reply style",
            content: "Use concise bullet points.",
          },
          mode: "replace",
        },
      ],
      forbiddenTools: ["updateAssistantSettingsCompat"],
      requiredCapabilities: ["settings"],
    },
  },
  {
    id: "draft-kb-append",
    title:
      "uses updateAssistantSettings to append to an existing draft knowledge base item",
    reportName: "draft knowledge base append uses upsert append",
    category: "assistant_settings",
    shape: "single_turn",
    realWorldSeed: "db-inspired",
    prompt: "Add this to the Reply style knowledge note: Avoid long greetings.",
    expectation: {
      kind: "assistant_settings",
      changes: [
        {
          path: "assistant.draftKnowledgeBase.upsert",
          value: {
            title: "Reply style",
            content: "Avoid long greetings.",
          },
          mode: "append",
        },
      ],
      forbiddenTools: ["updateAssistantSettingsCompat"],
      requiredCapabilities: ["settings"],
    },
  },
  {
    id: "draft-kb-delete",
    title: "uses updateAssistantSettings to delete a draft knowledge base item",
    reportName: "draft knowledge base delete uses delete path",
    category: "assistant_settings",
    shape: "single_turn",
    realWorldSeed: "synthetic-gap",
    prompt: "Delete the Reply style knowledge note.",
    expectation: {
      kind: "assistant_settings",
      changes: [
        {
          path: "assistant.draftKnowledgeBase.delete",
          value: {
            title: "Reply style",
          },
        },
      ],
      forbiddenTools: ["updateAssistantSettingsCompat"],
      requiredCapabilities: ["settings"],
    },
  },
  {
    id: "personal-instructions-append-multilingual",
    title:
      "uses updatePersonalInstructions append mode for multilingual personal instruction phrasing",
    reportName: "multilingual personal instructions append uses append mode",
    category: "personal_instructions",
    shape: "single_turn",
    realWorldSeed: "db-inspired",
    prompt:
      "Ajoute a mes instructions personnelles: answer in a calm, direct style and skip filler.",
    expectation: {
      kind: "personal_instructions",
      mode: "append",
      semanticExpectation:
        "Updated personal instructions that add a calm, direct style and avoiding filler to future responses.",
    },
  },
  {
    id: "personal-instructions-replace-conversational",
    title:
      "uses updatePersonalInstructions replace mode for conversational overwrite phrasing",
    reportName: "conversational overwrite uses personal instructions replace",
    category: "personal_instructions",
    shape: "single_turn",
    realWorldSeed: "db-inspired",
    prompt:
      "Let's start over on my personal instructions: replace them with write plainly, prefer bullets, and skip sign-offs.",
    expectation: {
      kind: "personal_instructions",
      mode: "replace",
      semanticExpectation:
        "Updated personal instructions that replace prior instructions with plain writing, bullet preference, and no sign-offs.",
    },
  },
  {
    id: "broad-memory-recall-empty-query",
    title: "uses an empty searchMemories query for broad recall requests",
    reportName: "broad memory recall uses empty search query",
    category: "search_memories",
    shape: "single_turn",
    realWorldSeed: "synthetic-gap",
    crossModelCanary: true,
    prompt: "What do you remember about me overall?",
    expectation: {
      kind: "search_memories",
      forbiddenTools: ["saveMemory"],
      requireEmptyQuery: true,
    },
  },
  {
    id: "same-turn-setting-and-memory-save",
    title:
      "activates settings and memory together for a same-turn settings write plus durable memory save",
    reportName: "same-turn setting write plus memory save uses both tools",
    category: "combined_write",
    shape: "single_turn",
    realWorldSeed: "db-inspired",
    crossModelCanary: true,
    prompt:
      "Turn on meeting briefs, and remember that I prefer newsletter cleanups after lunch.",
    expectation: {
      kind: "assistant_settings_and_save_memory",
      changes: [
        {
          path: "assistant.meetingBriefs.enabled",
          value: true,
        },
      ],
      expectedContent: "I prefer newsletter cleanups after lunch.",
      expectedUserEvidence: "I prefer newsletter cleanups after lunch.",
      forbiddenTools: ["updateAssistantSettingsCompat", "searchMemories"],
      requiredCapabilities: ["settings", "memory"],
    },
  },
  {
    id: "multi-turn-save-then-search",
    title:
      "searches stored memory in a later turn when the user follows up on an earlier remembered preference",
    reportName: "multi-turn prior-memory follow-up searches stored memory",
    category: "search_memories",
    shape: "multi_turn",
    realWorldSeed: "db-inspired",
    messages: [
      {
        role: "user",
        content: "Remember that I prefer newsletters batched after lunch.",
      },
      {
        role: "assistant",
        content: "I can remember that for future chats.",
      },
      {
        role: "user",
        content: "What do you remember about my newsletter preferences?",
      },
    ],
    expectation: {
      kind: "search_memories",
      semanticExpectation:
        "A memory search query that looks up the user's newsletter preferences.",
      forbiddenTools: ["updateAssistantSettingsCompat", "saveMemory"],
    },
  },
];

assertScenarioInventory(settingsMemoryScenariosRaw);

export const settingsMemoryScenarios = settingsMemoryScenariosRaw;

function assertScenarioInventory(scenarios: SettingsMemoryScenario[]) {
  if (scenarios.length !== 40) {
    throw new Error(
      `assistant-chat-settings-memory scenarios must total 40; received ${scenarios.length}.`,
    );
  }

  const canaryCount = scenarios.filter(
    (scenario) => scenario.crossModelCanary,
  ).length;

  if (canaryCount !== 6) {
    throw new Error(
      `assistant-chat-settings-memory canary subset must total 6; received ${canaryCount}.`,
    );
  }
}
