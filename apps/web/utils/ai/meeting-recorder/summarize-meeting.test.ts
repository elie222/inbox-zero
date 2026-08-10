import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getEmailAccount } from "@/__tests__/helpers";
import { aiSummarizeMeeting } from "@/utils/ai/meeting-recorder/summarize-meeting";

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
    const jsonSchema = z.toJSONSchema(schema) as {
      properties: Record<
        string,
        { items?: { properties: Record<string, unknown>; required?: string[] } }
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

    expect(summary).toEqual(object);
  });
});
