import { asSchema } from "ai";
import { describe, expect, it, vi } from "vitest";
import { getEmailAccount } from "@/__tests__/helpers";
import {
  aiSummarizeMeeting,
  parseMeetingSummary,
} from "@/utils/ai/meeting-recorder/summarize-meeting";

const { createGenerateObjectMock, generateObjectMock, getModelForUseCaseMock } =
  vi.hoisted(() => ({
    createGenerateObjectMock: vi.fn(),
    generateObjectMock: vi.fn(),
    getModelForUseCaseMock: vi.fn(),
  }));

vi.mock("@/utils/llms/index", () => ({
  createGenerateObject: createGenerateObjectMock,
}));

vi.mock("@/utils/llms/use-cases", async () => {
  const actual = await vi.importActual<typeof import("@/utils/llms/use-cases")>(
    "@/utils/llms/use-cases",
  );

  return {
    ...actual,
    getModelForUseCase: getModelForUseCaseMock,
  };
});

describe("aiSummarizeMeeting", () => {
  it("asks the model for a schema strict structured-output providers accept", async () => {
    createGenerateObjectMock.mockReturnValue(generateObjectMock);
    getModelForUseCaseMock.mockReturnValue({});
    const object = {
      overview: "The team reviewed the launch.",
      keyDecisions: [],
      actionItems: [
        { description: "Prepare the launch checklist", owner: null },
      ],
      openQuestions: [],
      nextSteps: [],
    };
    generateObjectMock.mockResolvedValue({ object });

    const summary = await aiSummarizeMeeting({
      emailAccount: getEmailAccount(),
      eventTitle: "Launch planning",
      attendees: [],
      transcript: [
        {
          speakerName: "Speaker",
          isHost: true,
          startTime: 0,
          endTime: 1,
          text: "Let's prepare the launch checklist.",
        },
      ],
    });

    const { schema } = generateObjectMock.mock.calls[0][0];
    const jsonSchema = (await Promise.resolve(asSchema(schema).jsonSchema)) as {
      properties: Record<
        string,
        {
          anyOf?: Array<{ type?: string }>;
          items?: {
            properties: Record<string, { anyOf?: Array<{ type?: string }> }>;
            required?: string[];
          };
        }
      >;
      required?: string[];
    };

    // Strict structured-output providers reject any property left optional, so
    // every declared property must be required at each level.
    expect([...(jsonSchema.required ?? [])].sort()).toEqual(
      Object.keys(jsonSchema.properties).sort(),
    );
    const actionItem = jsonSchema.properties.actionItems.items;
    expect([...(actionItem?.required ?? [])].sort()).toEqual(
      Object.keys(actionItem?.properties ?? {}).sort(),
    );
    expect(jsonSchema.properties.openQuestions.anyOf).toContainEqual({
      type: "null",
    });
    expect(jsonSchema.properties.nextSteps.anyOf).toContainEqual({
      type: "null",
    });
    expect(actionItem?.properties.owner.anyOf).toContainEqual({
      type: "null",
    });

    expect(summary).toEqual(object);
  });

  it("parses summaries stored before optional fields became nullable", () => {
    expect(
      parseMeetingSummary({
        overview: "The team reviewed the launch.",
        keyDecisions: [],
        actionItems: [{ description: "Prepare the launch checklist" }],
      }),
    ).toEqual({
      overview: "The team reviewed the launch.",
      keyDecisions: [],
      actionItems: [
        { description: "Prepare the launch checklist", owner: null },
      ],
      openQuestions: null,
      nextSteps: null,
    });
  });
});
