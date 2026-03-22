import { Venture } from "../types";

export interface VoiceToneProfile {
  example: string;
  instructions: string;
  venture: Venture;
}

const VOICE_PROFILES: Record<Venture, VoiceToneProfile> = {
  [Venture.SMART_COLLEGE]: {
    venture: Venture.SMART_COLLEGE,
    instructions:
      "Warm but professional. First-name basis with parents. Reference the student by name when possible. Keep it concise — parents are busy too.",
    example:
      "Hi Sarah — great news, I was able to move Zach's session to Saturday at noon. He's all set! Let me know if you need anything else.",
  },
  [Venture.PRAXIS]: {
    venture: Venture.PRAXIS,
    instructions:
      "More formal, forward-looking, solution-oriented. Express interest in partnerships. Suggest calls when appropriate.",
    example:
      "Thanks for reaching out. I'd love to learn more about what you're building — would you be open to a quick call this week?",
  },
  [Venture.PERSONAL]: {
    venture: Venture.PERSONAL,
    instructions: "Direct and casual. Nick's personal voice.",
    example:
      "Hey — thanks for the heads up. I'll take a look at this and get back to you.",
  },
};

export function getVoiceToneProfile(venture: Venture): VoiceToneProfile {
  return VOICE_PROFILES[venture];
}

export function formatVoiceToneForPrompt(profile: VoiceToneProfile): string {
  return [
    `You are responding on behalf of: ${ventureDisplayName(profile.venture)}`,
    `Voice: ${profile.instructions}`,
    `Example: "${profile.example}"`,
  ].join("\n");
}

function ventureDisplayName(venture: Venture): string {
  switch (venture) {
    case Venture.SMART_COLLEGE:
      return "Smart College";
    case Venture.PRAXIS:
      return "Praxis Education";
    case Venture.PERSONAL:
      return "Personal";
  }
}
