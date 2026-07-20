import { describe, expect, it } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import { getDraftSendLogSimilarityFields } from "./draft-similarity";

describe("getDraftSendLogSimilarityFields", () => {
  it("records normalized reply lengths without signatures or quoted content", () => {
    const accountSignature = [
      "Sender Name",
      "Company Name",
      "555-0100",
      "A long confidentiality disclaimer that is not authored reply content.",
    ].join("\n");
    const quotedThread = `On Mon, Jan 1, 2024 at 10:00 AM Sender <sender@example.com> wrote:
> A previous message with a lot of unrelated detail.`;
    const draftReply = "Short draft reply.";
    const sentReply = "Short sent reply.";
    const draftText = `${draftReply}\n\n${accountSignature}\n\n${quotedThread}`;
    const sentText = `${sentReply}\n\n${accountSignature}\n\n${quotedThread}`;

    const fields = getDraftSendLogSimilarityFields({
      draftText,
      sentMessage: createParsedMessage(sentText),
      sentText,
      accountSignature,
      draftExists: false,
      sentMessageRepliesToSource: true,
    });

    expect(fields.similarityMetadata).toMatchObject({
      version: 2,
      draft: {
        length: draftText.length,
        comparableBodyLength: draftReply.length,
      },
      sent: {
        extractedReplyLength: sentText.length,
        comparableBodyLength: sentReply.length,
      },
    });
  });
});

function createParsedMessage(textPlain: string): ParsedMessage {
  return {
    id: "sent-message-1",
    threadId: "thread-1",
    textPlain,
    textHtml: undefined,
    subject: "Test subject",
    date: new Date().toISOString(),
    snippet: textPlain,
    historyId: "history-1",
    internalDate: "1",
    headers: {
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Test subject",
      date: "Mon, 1 Jan 2024 10:00:00 +0000",
    },
    labelIds: [],
    inline: [],
    bodyContentType: "text",
  };
}
