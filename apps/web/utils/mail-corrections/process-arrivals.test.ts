import { beforeEach, expect, it, vi } from "vitest";
import { processObservedArrivals } from "./process-arrivals";
import { enabledSpamModel } from "@/utils/spam/store";
import { filterSpam } from "@/utils/spam/gate";
import { getMockMessage } from "@/__tests__/helpers";
import { createScopedLogger } from "@/utils/logger";
import { runRulesForMessage } from "@/utils/ai/choose-rule/run-rules-for-message";
import { AutomaticFilingDeferredError } from "./filing-eligibility";
import prisma from "@/utils/prisma";

vi.mock("@/utils/ai/choose-rule/run-rules-for-message", () => ({
  runRulesForMessage: vi.fn(),
}));

vi.mock("@/utils/spam/store", () => ({ enabledSpamModel: vi.fn() }));
vi.mock("@/utils/spam/gate", () => ({ filterSpam: vi.fn() }));
vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      findUniqueOrThrow: vi.fn(async () => ({
        userId: "user",
        createdAt: new Date(1000),
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
  logger: createScopedLogger("arrival-test"),
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMessage.mockReset();
  mocks.getMessageByRfc822MessageId.mockReset();
  vi.mocked(enabledSpamModel).mockResolvedValue({
    createdAt: new Date(1000),
  } as never);
  vi.mocked(filterSpam).mockResolvedValue(null);
  vi.mocked(runRulesForMessage).mockResolvedValue([]);
  vi.mocked(prisma.emailAccount.findUniqueOrThrow).mockResolvedValue({
    userId: "user",
    createdAt: new Date(1000),
    account: { provider: "icloud" },
  } as never);
  mocks.getMessage.mockResolvedValue({
    ...getMockMessage({ labelIds: ["INBOX"] }),
    internalDate: "2000",
  });
});
it.each([
  "icloud",
  "google",
])("spam checks %s arrivals before running filing rules", async (provider) => {
  vi.mocked(prisma.emailAccount.findUniqueOrThrow).mockResolvedValue({
    userId: "user",
    createdAt: new Date(1000),
    account: { provider },
  } as never);
  await processObservedArrivals(options);
  expect(filterSpam).toHaveBeenCalledTimes(1);
  expect(vi.mocked(filterSpam).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(runRulesForMessage).mock.invocationCallOrder[0],
  );
  expect(runRulesForMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      messageId: expect.any(String),
      emailAccountId: "account",
      provider,
      isTest: false,
      rerun: false,
      requireInbox: true,
    }),
  );
});
it("classifies fresh arrivals even when the spam filter is disabled", async () => {
  vi.mocked(enabledSpamModel).mockResolvedValue(null);
  await processObservedArrivals(options);
  expect(filterSpam).not.toHaveBeenCalled();
  expect(runRulesForMessage).toHaveBeenCalledOnce();
});
it("does not run filing rules after an arrival is moved to Junk", async () => {
  vi.mocked(filterSpam).mockResolvedValue({
    spam: true,
    score: 1,
    corrected: false,
  });
  await processObservedArrivals(options);
  expect(runRulesForMessage).not.toHaveBeenCalled();
});
it("keeps failed classification retryable", async () => {
  vi.mocked(runRulesForMessage).mockRejectedValueOnce(
    new Error("AI unavailable"),
  );
  await expect(processObservedArrivals(options)).rejects.toThrow(
    "AI unavailable",
  );
});
it("does not classify an email if the spam check fails", async () => {
  vi.mocked(filterSpam).mockRejectedValueOnce(
    new Error("Extraction unavailable"),
  );
  await expect(processObservedArrivals(options)).rejects.toThrow(
    "Extraction unavailable",
  );
  expect(runRulesForMessage).not.toHaveBeenCalled();
});
it.each([
  "ERROR",
  "APPLYING",
])("does not acknowledge an unfinished %s action as processed", async (status) => {
  vi.mocked(runRulesForMessage).mockResolvedValue([{ status }] as never);
  await expect(processObservedArrivals(options)).rejects.toThrow(
    "Arrival classification did not complete",
  );
});
it("does not classify messages that have already left Inbox", async () => {
  mocks.getMessage.mockResolvedValue({
    ...getMockMessage({ labelIds: [] }),
    internalDate: "2000",
  });
  await processObservedArrivals(options);
  expect(filterSpam).not.toHaveBeenCalled();
  expect(runRulesForMessage).not.toHaveBeenCalled();
});
it("leaves initial snapshots and already observed messages alone", async () => {
  await processObservedArrivals({ ...options, initialized: false });
  await processObservedArrivals({ ...options, previous: { new: observation } });
  expect(mocks.getMessage).not.toHaveBeenCalled();
  expect(runRulesForMessage).not.toHaveBeenCalled();
});
it("does not sweep older mail moved into an observed folder", async () => {
  mocks.getMessage.mockResolvedValue({
    ...getMockMessage({ labelIds: ["INBOX"] }),
    internalDate: "500",
  });
  await processObservedArrivals(options);
  expect(filterSpam).not.toHaveBeenCalled();
  expect(runRulesForMessage).not.toHaveBeenCalled();
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

  await processObservedArrivals({
    ...options,
    observations: [{ ...observation, rfcMessageId: "<message@example.test>" }],
  });

  expect(mocks.getMessageByRfc822MessageId).toHaveBeenCalledWith(
    "<message@example.test>",
  );
  expect(filterSpam).toHaveBeenCalledWith(
    expect.objectContaining({ message: fullMessage }),
  );
  expect(runRulesForMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      messageId: "relocated",
      threadId: fullMessage.threadId,
    }),
  );
});

it("keeps an unresolved arrival retryable instead of filtering partial content", async () => {
  const error = new Error("Message is unavailable");
  mocks.getMessage.mockRejectedValue(error);
  mocks.getMessageByRfc822MessageId.mockResolvedValue(null);

  await expect(
    processObservedArrivals({
      ...options,
      observations: [
        { ...observation, rfcMessageId: "<missing@example.test>" },
      ],
    }),
  ).rejects.toThrow(error);
  expect(filterSpam).not.toHaveBeenCalled();
});

it.each([
  ["INBOX", "UNREAD"],
  ["INBOX", "STARRED"],
])("defers filing for protected mail: %j", async (...labels) => {
  mocks.getMessage.mockResolvedValue({
    ...getMockMessage({ labelIds: labels }),
    internalDate: "2000",
  });
  expect(
    await processObservedArrivals({ ...options, fileAfterReading: true }),
  ).toEqual([observation.key]);
  expect(runRulesForMessage).not.toHaveBeenCalled();
});
it("keeps mail retryable when the live guard defers it during classification", async () => {
  vi.mocked(runRulesForMessage).mockRejectedValueOnce(
    new AutomaticFilingDeferredError(),
  );
  expect(
    await processObservedArrivals({ ...options, fileAfterReading: true }),
  ).toEqual([observation.key]);
});
it("requires the live read and flag guard for eligible mail", async () => {
  await processObservedArrivals({ ...options, fileAfterReading: true });
  expect(runRulesForMessage).toHaveBeenCalledWith(
    expect.objectContaining({ requireReadUnflagged: true }),
  );
});
