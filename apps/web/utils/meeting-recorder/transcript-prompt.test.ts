import { describe, expect, it } from "vitest";
import type { NormalizedTranscript } from "@/utils/meeting-recorder/bot-provider";
import { transcriptToPromptText } from "@/utils/meeting-recorder/transcript-prompt";

describe("transcriptToPromptText", () => {
  it("renders speaker-labelled, timestamped lines", () => {
    const text = transcriptToPromptText([
      utterance({ speakerName: "Alice", startTime: 0, text: "Welcome" }),
      utterance({ speakerName: "Bob", startTime: 75, text: "Thanks" }),
    ]);

    expect(text).toBe("[00:00] Alice: Welcome\n[01:15] Bob: Thanks");
  });

  it("keeps the opening and closing when the transcript exceeds the budget", () => {
    const transcript = Array.from({ length: 500 }, (_, index) =>
      utterance({
        speakerName: "Alice",
        startTime: index,
        text: `Line number ${index} with some padding text`,
      }),
    );

    const text = transcriptToPromptText(transcript, 2000);

    expect(text.length).toBeLessThanOrEqual(2000);
    expect(text).toContain("Line number 0 ");
    expect(text).toContain("Line number 499 ");
    expect(text).toContain("Transcript truncated");
  });

  it("returns the transcript untouched when it fits", () => {
    const transcript = [utterance({ text: "Short" })];

    expect(transcriptToPromptText(transcript, 1000)).toBe(
      "[00:00] Alice: Short",
    );
  });
});

function utterance({
  speakerName = "Alice",
  startTime = 0,
  text,
}: {
  speakerName?: string;
  startTime?: number;
  text: string;
}): NormalizedTranscript[number] {
  return {
    speakerName,
    isHost: false,
    startTime,
    endTime: startTime + 1,
    text,
  };
}
