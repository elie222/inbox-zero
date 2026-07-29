import { describe, expect, it } from "vitest";
import { normalizeRecallTranscript } from "@/utils/recall/transcript";
import type { RecallTranscriptDownload } from "@/utils/recall/types";

describe("normalizeRecallTranscript", () => {
  it("collapses words into utterances with speaker and timing", () => {
    const result = normalizeRecallTranscript([
      turn({
        name: "Alice",
        isHost: true,
        email: "alice@example.com",
        words: [
          ["Let's", 0, 0.4],
          ["start", 0.4, 0.9],
        ],
      }),
      turn({
        name: "Bob",
        words: [
          ["Sounds", 1.0, 1.4],
          ["good", 1.4, 1.8],
        ],
      }),
    ]);

    expect(result).toEqual([
      {
        speakerName: "Alice",
        isHost: true,
        email: "alice@example.com",
        startTime: 0,
        endTime: 0.9,
        text: "Let's start",
      },
      {
        speakerName: "Bob",
        isHost: false,
        email: undefined,
        startTime: 1.0,
        endTime: 1.8,
        text: "Sounds good",
      },
    ]);
  });

  it("merges consecutive turns by the same speaker", () => {
    const result = normalizeRecallTranscript([
      turn({ name: "Alice", words: [["One", 0, 0.5]] }),
      turn({
        name: "Alice",
        words: [
          ["more", 0.6, 1.0],
          ["thing", 1.0, 1.4],
        ],
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      speakerName: "Alice",
      text: "One more thing",
      startTime: 0,
      endTime: 1.4,
    });
  });

  it("keeps two participants apart when they share a name and have no email", () => {
    const result = normalizeRecallTranscript([
      {
        participant: { id: 1, name: "Alex", is_host: false, email: null },
        words: [
          {
            text: "Mine",
            start_timestamp: { relative: 0 },
            end_timestamp: { relative: 0.3 },
          },
        ],
      },
      {
        participant: { id: 2, name: "Alex", is_host: false, email: null },
        words: [
          {
            text: "Theirs",
            start_timestamp: { relative: 0.4 },
            end_timestamp: { relative: 0.8 },
          },
        ],
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((utterance) => utterance.text)).toEqual([
      "Mine",
      "Theirs",
    ]);
  });

  it("keeps turns separate when the same display name has different emails", () => {
    const result = normalizeRecallTranscript([
      turn({ name: "Alex", email: "alex@one.com", words: [["Hi", 0, 0.2]] }),
      turn({ name: "Alex", email: "alex@two.com", words: [["Hey", 0.3, 0.5]] }),
    ]);

    expect(result).toHaveLength(2);
  });

  it("skips empty turns and falls back to a placeholder speaker name", () => {
    const result = normalizeRecallTranscript([
      turn({ name: "  ", words: [["Hello", 0, 0.3]] }),
      turn({ name: "Bob", words: [["   ", 1, 1.2]] }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.speakerName).toBe("Unknown speaker");
  });

  it("defaults missing timestamps to zero rather than throwing", () => {
    const result = normalizeRecallTranscript([
      {
        participant: { id: 1, name: "Alice", is_host: null, email: null },
        words: [{ text: "Hi", start_timestamp: null, end_timestamp: null }],
      },
    ]);

    expect(result[0]).toMatchObject({ startTime: 0, endTime: 0 });
  });
});

function turn({
  name,
  isHost = false,
  email,
  words,
}: {
  name: string;
  isHost?: boolean;
  email?: string;
  words: Array<[string, number, number]>;
}): RecallTranscriptDownload[number] {
  return {
    participant: { id: name, name, is_host: isHost, email: email ?? null },
    words: words.map(([text, start, end]) => ({
      text,
      start_timestamp: { relative: start },
      end_timestamp: { relative: end },
    })),
  };
}
