import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import { createTestLogger } from "@/__tests__/helpers";
import { createEmailProvider } from "@/utils/email/provider";
import {
  createOrGetCategoryTool,
  createOrGetLabelTool,
  listCategoriesTool,
  listLabelsTool,
} from "./chat-label-tools";

vi.mock("@/utils/email/provider");
vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));

const logger = createTestLogger();
const TEST_EMAIL = "user@test.com";

describe("chat label tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses category wording in model-visible Outlook category tool contracts", () => {
    const toolOptions = {
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    };

    const contractText = [
      listCategoriesTool(toolOptions),
      createOrGetCategoryTool(toolOptions),
    ]
      .map(serializeToolContract)
      .join("\n");

    expect(contractText).toMatch(/\bcategor/i);
    expect(contractText).not.toMatch(/\blabels?\b/i);
  });

  it("lists all categories without filtering or limiting", async () => {
    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getLabels: vi.fn().mockResolvedValue([
          { id: "category-1", name: "Receipts", type: "user" },
          { id: "category-2", name: "Operations", type: "user" },
        ]),
      }),
    );

    const toolInstance = listCategoriesTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result = await (toolInstance.execute as any)({});

    expect(result).toEqual({
      categories: [
        { id: "category-1", name: "Receipts", type: "user" },
        { id: "category-2", name: "Operations", type: "user" },
      ],
    });
  });

  it("lists all labels without filtering or limiting", async () => {
    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getLabels: vi.fn().mockResolvedValue([
          { id: "label-1", name: "Work-Items_/2026.Report", type: "user" },
          { id: "label-2", name: "Receipts", type: "user" },
        ]),
      }),
    );

    const toolInstance = listLabelsTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({});

    expect(result).toEqual({
      labels: [
        { id: "label-1", name: "Work-Items_/2026.Report", type: "user" },
        { id: "label-2", name: "Receipts", type: "user" },
      ],
    });
  });

  it("returns an existing normalized label before creating a new one", async () => {
    const getLabels = vi
      .fn()
      .mockResolvedValue([
        { id: "label-1", name: "Work-Items_/2026.Report", type: "user" },
      ]);
    const createLabel = vi.fn().mockResolvedValue({
      id: "label-2",
      name: "Work-Items_/2026.Report",
      type: "user",
    });

    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getLabels,
        createLabel,
      }),
    );

    const toolInstance = createOrGetLabelTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const existingResult = await (toolInstance.execute as any)({
      name: " work items /2026 report ",
    });

    expect(existingResult).toEqual({
      created: false,
      label: {
        id: "label-1",
        name: "Work-Items_/2026.Report",
        type: "user",
      },
    });
    expect(createLabel).not.toHaveBeenCalled();
    expect(getLabels).toHaveBeenCalledTimes(1);
    expect(getLabels).toHaveBeenCalledWith();
  });

  it("creates a label when no visible or hidden normalized match exists", async () => {
    const getLabels = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const createLabel = vi.fn().mockResolvedValue({
      id: "label-2",
      name: "Work-Items_/2026.Report",
      type: "user",
    });

    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getLabels,
        createLabel,
      }),
    );

    const toolInstance = createOrGetLabelTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      name: "Work-Items_/2026.Report",
    });

    expect(createLabel).toHaveBeenCalledWith("Work-Items_/2026.Report");
    expect(result).toEqual({
      created: true,
      label: {
        id: "label-2",
        name: "Work-Items_/2026.Report",
        type: "user",
      },
    });
    expect(getLabels).toHaveBeenCalledTimes(2);
    expect(getLabels).toHaveBeenNthCalledWith(1);
    expect(getLabels).toHaveBeenNthCalledWith(2, { includeHidden: true });
  });

  it("reuses a hidden normalized label before creating a new one", async () => {
    const getLabels = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "label-hidden",
          name: "Foo-Bar",
          type: "user",
          labelListVisibility: "labelHide",
        },
      ]);
    const createLabel = vi.fn();

    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getLabels,
        createLabel,
      }),
    );

    const toolInstance = createOrGetLabelTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      name: "foo bar",
    });

    expect(result).toEqual({
      created: false,
      label: {
        id: "label-hidden",
        name: "Foo-Bar",
        type: "user",
      },
    });
    expect(createLabel).not.toHaveBeenCalled();
    expect(getLabels).toHaveBeenCalledTimes(2);
    expect(getLabels).toHaveBeenNthCalledWith(1);
    expect(getLabels).toHaveBeenNthCalledWith(2, { includeHidden: true });
  });
});

function serializeToolContract(toolInstance: {
  description?: string;
  inputSchema?: unknown;
}) {
  return [
    toolInstance.description,
    ...collectSchemaDescriptions(toolInstance.inputSchema),
  ]
    .filter(Boolean)
    .join("\n");
}

function collectSchemaDescriptions(schema: unknown): string[] {
  if (!schema || typeof schema !== "object") return [];

  const schemaObject = schema as {
    description?: string;
    def?: {
      shape?: Record<string, unknown>;
      innerType?: unknown;
      element?: unknown;
      in?: unknown;
      out?: unknown;
      options?: unknown[];
    };
  };
  const descriptions = schemaObject.description
    ? [schemaObject.description]
    : [];
  const def = schemaObject.def;

  if (def?.shape) {
    for (const value of Object.values(def.shape)) {
      descriptions.push(...collectSchemaDescriptions(value));
    }
  }

  for (const value of [def?.innerType, def?.element, def?.in, def?.out]) {
    descriptions.push(...collectSchemaDescriptions(value));
  }

  for (const option of def?.options ?? []) {
    descriptions.push(...collectSchemaDescriptions(option));
  }

  return descriptions;
}
