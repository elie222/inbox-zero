import { beforeEach, expect, it, vi } from "vitest";
import { filterObservedSpam } from "./observe";
import { enabledSpamModel } from "./store";
import { filterSpam } from "./gate";
import { getMockMessage } from "@/__tests__/helpers";
import { createScopedLogger } from "@/utils/logger";

vi.mock("./store", () => ({ enabledSpamModel: vi.fn() }));
vi.mock("./gate", () => ({ filterSpam: vi.fn() }));
vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      findUniqueOrThrow: vi.fn(async () => ({
        account: { provider: "icloud" },
      })),
    },
  },
}));
const mocks = vi.hoisted(() => ({ getMessage: vi.fn() }));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(async () => ({ getMessage: mocks.getMessage })),
}));
const observation = {
  key: "new",
  messageId: "new",
  threadId: "new",
  sender: "sender@example.test",
  subject: "Hello",
  recipients: [],
  targets: ["@inbox"],
  observedAt: 2000,
};
const options = {
  emailAccountId: "account",
  observations: [observation],
  previous: {},
  initialized: true,
  logger: createScopedLogger("spam-arrival-test"),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enabledSpamModel).mockResolvedValue({
    createdAt: new Date(1000),
  } as never);
  mocks.getMessage.mockResolvedValue({
    ...getMockMessage({ labelIds: ["INBOX"] }),
    internalDate: "2000",
  });
});
it("filters new arrivals without invoking or unpausing bulk work", async () => {
  await filterObservedSpam(options);
  expect(filterSpam).toHaveBeenCalledTimes(1);
});
it("leaves initial snapshots and already observed messages alone", async () => {
  await filterObservedSpam({ ...options, initialized: false });
  await filterObservedSpam({ ...options, previous: { new: observation } });
  expect(mocks.getMessage).not.toHaveBeenCalled();
});
it("does not sweep older mail moved into an observed folder", async () => {
  mocks.getMessage.mockResolvedValue({
    ...getMockMessage({ labelIds: ["INBOX"] }),
    internalDate: "500",
  });
  await filterObservedSpam(options);
  expect(filterSpam).not.toHaveBeenCalled();
});
