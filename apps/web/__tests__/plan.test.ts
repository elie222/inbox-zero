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
        functions: [
          {
            name: "forward_receipts",
            description: "Forward receipts to my accountant",
            parameters: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: "requires_more_information",
            description: "Request more information to handle the email",
            parameters: {
              type: "object",
              properties: {},
              required: [],
            },
          },
        ],
        userAbout: "",
        userEmail: "",
      });

      expect(response).toBeUndefined();
    },
    TIMEOUT
  );
});

describe("AI Plan Simple", () => {
  const options = {
    model: MODEL,
    email: {
      from: "billing@stripe.com",
      subject: "Your receipt from IZ",
      content: "Receipt from IZ. Amount: $10. Thanks for your business!",
    },
    functions: [
      {
        name: "forward_receipts",
        description: "Forward receipts to my accountant",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    ],
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
