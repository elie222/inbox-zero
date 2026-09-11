export function getOnboardingChatInput(parts: unknown[]) {
  return {
    messages: [
      {
        id: "message-1",
        role: "user",
        parts,
      },
    ],
    setup: {
      rules: [],
      status: "draft",
    },
    scan: {
      status: "pending",
      emailsPerDay: null,
      emailsLastMonth: null,
      cleanupSuggestions: [],
      totalCleanupSuggestions: 0,
    },
    isPremium: false,
  };
}
