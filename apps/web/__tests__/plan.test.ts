import {
  getAiResponse,
  getAiResponseWithoutFunctionCalling,
} from "@/app/api/ai/act/controller";

// NOTE: these tests cost money to run as they call the OpenAI API.
// Be careful when running them in watch mode as they'll run on every file change.

// Improving the AI is a lot of trial and error.
// This test suite makes it easier to test different models and parameters.

const TIMEOUT = 15_000;
const MODEL = "gpt-3.5-turbo" as const;
// const MODEL = "gpt-4" as const;

const functions = [
  {
    name: "forward_receipts",
    description: "Forward receipts to my accountant",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  // {
  //   name: "requires_more_information",
  //   description: "Request more information to handle the email",
  //   parameters: {
  //     type: "object",
  //     properties: {},
  //     required: [],
  //   },
  // },
  {
    name: "haro",
    description:
      "If I get an email from HARO asking me questions, choose one of the questions, and send an email with the answer. The email address to send the answer to is noted in the email.\n" +
      "\n" +
      "Prefer to answer questions about startups, crypto, and AI.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "cold_email",
    description: 'Label all cold emails as "Cold Email" and archive them.',
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "requires_more_information",
    description: "Request more information to handle the email.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

const noRule = functions.length;

describe("AI Plan", () => {
  it(
    "AI responds with unknown rule",
    async () => {
      const response = await getAiResponse({
        model: MODEL,
        email: {
          from: "elie@test.com",
          subject: "Catching up",
          content: "Hey, how are you doing?",
        },
        functions,
        userAbout: "",
        userEmail: "",
      });

      expect(response).toBeUndefined();
    },
    TIMEOUT
  );
});

describe("AI Plan 1", () => {
  const options = {
    model: MODEL,
    email: {
      from: "billing@stripe.com",
      subject: "Your receipt from IZ",
      content: "Receipt from IZ. Amount: $10. Thanks for your business!",
    },
    functions,
    userAbout: "",
    userEmail: "",
  };

  it(
    "AI follows rule",
    async () => {
      const response = await getAiResponse(options);
      expect(response).toEqual({ name: "forward_receipts", arguments: "{}" });
    },
    TIMEOUT
  );

  it(
    "AI follows rule (without function calling)",
    async () => {
      const response = await getAiResponseWithoutFunctionCalling(options);
      expect(response).toEqual({
        rule: 1,
        reason: expect.any(String),
      });
    },
    TIMEOUT
  );
});

describe.only("AI Plan 2", () => {
  const options = {
    model: MODEL,
    email: {
      from: "Max Percy <notifications@github.com>",
      subject:
        "Re: [upstash/sdk-qstash-ts] Question: would the queue process in sequence (Issue #32)",
      content: `With v2 we've laid the foundation to make this possible, but we got other things in the pipeline first, so not likely to be in the next 1-2 months

—
Reply to this email directly, view it on GitHub, or unsubscribe.
You are receiving this because you commented.Message ID: <upstash/sdk-qstash-ts/issues/32/1708038228@github.com`,
    },
    functions,
    userAbout: "",
    userEmail: "",
  };

  // fails with gpt 3.5 turbo
  // it(
  //   "AI follows rule",
  //   async () => {
  //     const response = await getAiResponse(options);
  //     expect(response).toBeUndefined();
  //   },
  //   TIMEOUT
  // );

  it(
    "AI follows rule (without function calling)",
    async () => {
      const response = await getAiResponseWithoutFunctionCalling(options);
      expect(response).toEqual({
        rule: noRule,
        reason: expect.any(String),
      });
    },
    TIMEOUT
  );
});
