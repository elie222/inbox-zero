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
const mocks = vi.hoisted(() => ({
  getMessage: vi.fn(),
  getMessageByRfc822MessageId: vi.fn(),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(async () => mocks),
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
  mocks.getMessage.mockReset();
  mocks.getMessageByRfc822MessageId.mockReset();
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

it("resolves an IMAP observation to the full message before filtering", async () => {
  const fullMessage = {
    ...getMockMessage({ id: "relocated", labelIds: ["INBOX"] }),
    internalDate: "2000",
  };
  mocks.getMessage
    .mockRejectedValueOnce(new Error("Unknown observation ID"))
    .mockResolvedValueOnce(fullMessage);
  mocks.getMessageByRfc822MessageId.mockResolvedValue({ id: "relocated" });

  await filterObservedSpam({
    ...options,
    observations: [{ ...observation, rfcMessageId: "<message@example.test>" }],
  });

  expect(mocks.getMessageByRfc822MessageId).toHaveBeenCalledWith(
    "<message@example.test>",
  );
  expect(filterSpam).toHaveBeenCalledWith(
    expect.objectContaining({ message: fullMessage }),
  );
});

it("keeps an unresolved arrival retryable instead of filtering partial content", async () => {
  const error = new Error("Message is unavailable");
  mocks.getMessage.mockRejectedValue(error);
  mocks.getMessageByRfc822MessageId.mockResolvedValue(null);

  await expect(
    filterObservedSpam({
      ...options,
      observations: [
        { ...observation, rfcMessageId: "<missing@example.test>" },
      ],
    }),
  ).rejects.toThrow(error);
  expect(filterSpam).not.toHaveBeenCalled();
});
