import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, wrapLanguageModel } from "ai";
import { describe, expect, it } from "vitest";
import {
  coalesceConsecutiveMessages,
  coalesceConsecutiveMessagesMiddleware,
} from "./coalesce-messages";

describe("coalesceConsecutiveMessagesMiddleware", () => {
  it("sends alternating roles to an OpenAI-compatible server", async () => {
    let requestBody: { messages: unknown[] } | undefined;
    const provider = createOpenAICompatible({
      name: "openai-compatible",
      baseURL: "http://localhost:1234/v1",
      fetch: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return Response.json({
          id: "1",
          created: 0,
          model: "local",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Done" },
              finish_reason: "stop",
            },
          ],
        });
      },
    });

    await generateText({
      model: wrapLanguageModel({
        model: provider("local"),
        middleware: coalesceConsecutiveMessagesMiddleware,
      }),
      allowSystemInMessages: true,
      messages: [
        { role: "system", content: "System" },
        { role: "user", content: "[Automated context]" },
        { role: "user", content: "[Inbox snapshot]" },
        { role: "user", content: "Reanalyse this email" },
      ],
    });

    expect(requestBody?.messages).toEqual([
      { role: "system", content: "System" },
      {
        role: "user",
        content:
          "[Automated context]\n\n[Inbox snapshot]\n\nReanalyse this email",
      },
    ]);
  });
});

describe("coalesceConsecutiveMessages", () => {
  it("merges consecutive user text messages into one text part", () => {
    expect(
      coalesceConsecutiveMessages([
        { role: "system", content: "System" },
        { role: "user", content: [{ type: "text", text: "Context" }] },
        { role: "user", content: [{ type: "text", text: "" }] },
        { role: "user", content: [{ type: "text", text: "Question" }] },
        { role: "assistant", content: [{ type: "text", text: "Answer" }] },
        { role: "user", content: [{ type: "text", text: "Follow-up" }] },
      ]),
    ).toEqual([
      { role: "system", content: "System" },
      {
        role: "user",
        content: [{ type: "text", text: "Context\n\nQuestion" }],
      },
      { role: "assistant", content: [{ type: "text", text: "Answer" }] },
      { role: "user", content: [{ type: "text", text: "Follow-up" }] },
    ]);
  });

  it("keeps file parts in order when merging", () => {
    const image = {
      type: "file" as const,
      mediaType: "image/png",
      data: {
        type: "url" as const,
        url: new URL("https://example.com/image.png"),
      },
    };

    expect(
      coalesceConsecutiveMessages([
        { role: "user", content: [{ type: "text", text: "Look:" }] },
        { role: "user", content: [image] },
      ]),
    ).toEqual([
      {
        role: "user",
        content: [{ type: "text", text: "Look:" }, image],
      },
    ]);
  });

  it("keeps tool call and result pairs intact", () => {
    const prompt = [
      {
        role: "user" as const,
        content: [{ type: "text" as const, text: "Hi" }],
      },
      {
        role: "assistant" as const,
        content: [
          {
            type: "tool-call" as const,
            toolCallId: "call-1",
            toolName: "searchInbox",
            input: {},
          },
        ],
      },
      {
        role: "tool" as const,
        content: [
          {
            type: "tool-result" as const,
            toolCallId: "call-1",
            toolName: "searchInbox",
            output: { type: "json" as const, value: { count: 3 } },
          },
        ],
      },
      {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "Found 3" }],
      },
    ];

    expect(coalesceConsecutiveMessages(prompt)).toEqual(prompt);
  });
});
