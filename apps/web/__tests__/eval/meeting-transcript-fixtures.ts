import type { NormalizedTranscript } from "@/utils/meeting-recorder/bot-provider";

type Turn = [speaker: string, text: string];

/**
 * A transcript where the group reverses an earlier decision, one action item is
 * explicitly claimed and another is left unassigned, and two speakers share a
 * first name.
 */
export const REVERSED_DECISION_TRANSCRIPT = buildTranscript([
  ["Dana Whitfield", "Thanks for making time. Let's start with the rollout."],
  [
    "Chris Alvarez",
    "Right. Our plan was to ship to everyone on the fifteenth.",
  ],
  ["Dana Whitfield", "Let's lock that in. The fifteenth works."],
  [
    "Chris Okonkwo",
    "Hang on. Support is short-staffed that week, we'd be shipping into nobody.",
  ],
  ["Dana Whitfield", "How short?"],
  ["Chris Okonkwo", "Two people out. It's a bad week for us."],
  [
    "Dana Whitfield",
    "Okay, forget the fifteenth then. Let's do the twenty-second instead, full rollout.",
  ],
  ["Chris Alvarez", "The twenty-second is fine on our side."],
  ["Chris Okonkwo", "Works for me."],
  [
    "Dana Whitfield",
    "I'll update the launch doc with the new date and send it round.",
  ],
  [
    "Chris Alvarez",
    "Someone needs to tell the customers who already got the fifteenth in writing.",
  ],
  ["Dana Whitfield", "Agreed, that has to happen. We'll sort out who."],
  [
    "Chris Okonkwo",
    "One more thing, are we still doing the migration webinar? Nobody has owned that.",
  ],
  ["Dana Whitfield", "Unclear. Let's park it and pick it up next week."],
]);

/**
 * A vendor call full of half-finished sentences and cross-talk, where the
 * pricing question is raised but never answered.
 */
export const UNRESOLVED_PRICING_TRANSCRIPT = buildTranscript([
  ["Priya Raman", "So we've had a look at the proposal and mostly it's, yeah."],
  ["Tom Beckett", "Mostly good or mostly-"],
  ["Priya Raman", "Mostly good. The integration piece is what we wanted."],
  ["Tom Beckett", "Great, that's the part we build for."],
  [
    "Priya Raman",
    "The bit we're stuck on is the seat count. We've got forty people but only about fifteen would use it daily.",
  ],
  ["Tom Beckett", "Sure, and the-"],
  ["Priya Raman", "So do we pay for forty or fifteen?"],
  [
    "Tom Beckett",
    "That's a good question. Honestly I'd have to check with our commercial team, I don't want to quote you something wrong.",
  ],
  ["Priya Raman", "Fair enough. When could you come back on that?"],
  [
    "Tom Beckett",
    "Let me talk to them and I'll come back to you. I'd rather get it right than guess.",
  ],
  ["Priya Raman", "Okay. We can't really move until we know."],
  ["Tom Beckett", "Understood. I'll chase it."],
  ["Priya Raman", "Great. Thanks Tom."],
]);

/** A transcript with a clear owner and an explicit deadline. */
export const CLEAR_ACTION_ITEMS_TRANSCRIPT = buildTranscript([
  [
    "Sam Ortiz",
    "Quick one: the security review. Where are we with the questionnaire?",
  ],
  [
    "Jules Fontaine",
    "I've filled in about half. I'll finish it and send it to your team by Thursday.",
  ],
  ["Sam Ortiz", "Thursday works. I'll get it in front of our reviewer Friday."],
  [
    "Jules Fontaine",
    "There's one question about data residency I can't answer without our infra lead.",
  ],
  ["Sam Ortiz", "Flag it and we'll handle it separately, don't hold the rest."],
  ["Jules Fontaine", "Will do."],
]);

function buildTranscript(turns: Turn[]): NormalizedTranscript {
  return turns.map(([speakerName, text], index) => ({
    speakerName,
    isHost: index === 0,
    startTime: index * 12,
    endTime: index * 12 + 10,
    text,
  }));
}
