import { Plan } from "@/utils/redis/plan";
import { ChatCompletionCreateParams } from "openai/resources/chat";

type PlanWithThread = Plan & { threadId: string };

export type FilterFunction = (
  plan?: PlanWithThread,
  args?: FilterArgs
) => boolean;
export type FilterArgs = any;
export type Filters = "label" | "to_respond" | "by_id";

export const filterFunctions: ChatCompletionCreateParams.Function[] = [
  {
    name: "label",
    description:
      "Finds all emails with a specific label.  Returns true if the email has the label, false otherwise.",
    parameters: {
      type: "object",
      properties: {
        label: {
          type: "string",
          description: "The name of the label.",
        },
      },
      required: ["label"],
    },
  },
  {
    name: "to_respond",
    description:
      "Finds all emails that require a response.  Returns true if the email requires a response, false otherwise.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "by_id",
    description:
      "Finds emails by a specific id.  Returns true if the email has the id, false otherwise.",
    parameters: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          items: {
            type: "string",
          },
          description: "An array of ids to match against.",
        },
      },
      required: [],
    },
  },
];

export const label: FilterFunction = (
  plan?: PlanWithThread,
  args?: { label: string }
) => {
  return false;
  // return plan?.label?.toLowerCase() === args?.label.toLowerCase();
};

export const to_respond: FilterFunction = (plan?: PlanWithThread) => {
  return false;
  // return plan?.action === "reply";
};

export const by_id: FilterFunction = (
  plan?: PlanWithThread,
  args?: { ids: string }
) => {
  return !!(plan?.threadId && args?.ids.includes(plan?.threadId));
};

export const getFilterFunction = (filter: Filters): FilterFunction => {
  switch (filter) {
    case "label":
      return label;
    case "to_respond":
      return to_respond;
    case "by_id":
      return by_id;
    default:
      throw new Error(`Unknown filter: ${filter}`);
  }
};
