// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewsletterStatus } from "@/generated/prisma/enums";
import type { Row } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/types";
import { EMAIL_PROVIDER_RATE_LIMIT_MESSAGE } from "@/utils/error";

const {
  setSenderStatusActionMock,
  unsubscribeSenderActionMock,
  decrementCreditMock,
  queueArchiveSendersMock,
  addToArchiveSenderThreadQueueMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  setSenderStatusActionMock: vi.fn(),
  unsubscribeSenderActionMock: vi.fn(),
  decrementCreditMock: vi.fn(),
  queueArchiveSendersMock: vi.fn(),
  addToArchiveSenderThreadQueueMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("@/utils/actions/unsubscriber", () => ({
  setSenderStatusAction: setSenderStatusActionMock,
  unsubscribeSenderAction: unsubscribeSenderActionMock,
}));

vi.mock("@/utils/actions/premium", () => ({
  decrementUnsubscribeCreditAction: decrementCreditMock,
}));

vi.mock("@/store/archive-sender-queue", () => ({
  addToArchiveSenderThreadQueue: addToArchiveSenderThreadQueueMock,
  useArchiveSenderQueueActions: () => ({
    queueArchiveSenders: queueArchiveSendersMock,
  }),
}));

vi.mock("@/store/archive-queue", () => ({ deleteEmails: vi.fn() }));

vi.mock("@/utils/actions/mail-bulk-action", () => ({
  bulkArchiveAction: vi.fn(),
  bulkTrashAction: vi.fn(),
}));

vi.mock("@/hooks/useProductAnalytics", () => ({
  useProductAnalytics: () => ({ captureAction: vi.fn() }),
}));

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ executeAsync: vi.fn(), isExecuting: false }),
}));

vi.mock("@/utils/fetch", () => ({ fetchWithAccount: vi.fn() }));

vi.mock("@/components/Toast", () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: toastErrorMock,
    loading: vi.fn(),
    promise: vi.fn(),
  },
}));

import {
  useApproveButton,
  useAutoArchive,
  useBulkAutoArchive,
  useUnsubscribe,
} from "./hooks";

const EMAIL_ACCOUNT_ID = "email-account-1";
const SENDER = "news@example.com";

function getRow(overrides: Partial<Row> = {}): Row {
  return { name: SENDER, ...overrides };
}

const sharedHookArgs = {
  emailAccountId: EMAIL_ACCOUNT_ID,
  hasUnsubscribeAccess: true,
  mutate: vi.fn().mockResolvedValue(undefined),
  posthog: { capture: vi.fn() } as never,
  refetchPremium: vi.fn().mockResolvedValue(undefined),
};

describe("bulk unsubscribe hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSenderStatusActionMock.mockResolvedValue({
      data: { autoArchived: true },
    });
    decrementCreditMock.mockResolvedValue(undefined);
    queueArchiveSendersMock.mockResolvedValue(1);
    addToArchiveSenderThreadQueueMock.mockResolvedValue(undefined);
  });

  describe("useAutoArchive", () => {
    it("sets the auto archive status and queues the sender's mail", async () => {
      const { result } = renderHook(() =>
        useAutoArchive({ item: getRow(), ...sharedHookArgs }),
      );

      await act(async () => {
        await result.current.onAutoArchive();
      });

      expect(setSenderStatusActionMock).toHaveBeenCalledWith(EMAIL_ACCOUNT_ID, {
        senderEmail: SENDER,
        status: NewsletterStatus.AUTO_ARCHIVED,
        labelId: undefined,
        labelName: undefined,
      });
      expect(queueArchiveSendersMock).toHaveBeenCalledWith({
        senders: [SENDER],
      });
      expect(addToArchiveSenderThreadQueueMock).not.toHaveBeenCalled();
    });

    it("passes the label through so archived mail is labelled", async () => {
      const { result } = renderHook(() =>
        useAutoArchive({ item: getRow(), ...sharedHookArgs }),
      );

      await act(async () => {
        await result.current.onAutoArchiveAndLabel("label-1", "Newsletters");
      });

      expect(setSenderStatusActionMock).toHaveBeenCalledWith(EMAIL_ACCOUNT_ID, {
        senderEmail: SENDER,
        status: NewsletterStatus.AUTO_ARCHIVED,
        labelId: "label-1",
        labelName: "Newsletters",
      });
      expect(addToArchiveSenderThreadQueueMock).toHaveBeenCalledWith({
        sender: SENDER,
        labelId: "label-1",
        emailAccountId: EMAIL_ACCOUNT_ID,
      });
      expect(queueArchiveSendersMock).not.toHaveBeenCalled();
    });

    it("clears the status when disabling auto archive", async () => {
      const { result } = renderHook(() =>
        useAutoArchive({
          item: getRow({
            status: NewsletterStatus.AUTO_ARCHIVED,
            autoArchived: { id: "filter-1" },
          }),
          ...sharedHookArgs,
        }),
      );

      await act(async () => {
        await result.current.onDisableAutoArchive();
      });

      expect(setSenderStatusActionMock).toHaveBeenCalledWith(EMAIL_ACCOUNT_ID, {
        senderEmail: SENDER,
        status: null,
      });
    });

    it("surfaces a failure to enable auto archive instead of reporting success", async () => {
      setSenderStatusActionMock.mockResolvedValue({
        serverError: "Filter creation failed",
      });

      const { result } = renderHook(() =>
        useAutoArchive({ item: getRow(), ...sharedHookArgs }),
      );

      await act(async () => {
        await result.current.onAutoArchive();
      });

      expect(toastErrorMock).toHaveBeenCalled();
      expect(queueArchiveSendersMock).not.toHaveBeenCalled();
    });
  });

  describe("useBulkAutoArchive", () => {
    it("stops after a provider rate limit and leaves remaining senders selected", async () => {
      setSenderStatusActionMock
        .mockResolvedValueOnce({ data: { autoArchived: true } })
        .mockResolvedValueOnce({
          serverError: EMAIL_PROVIDER_RATE_LIMIT_MESSAGE,
        });
      const onDeselectItem = vi.fn();

      const { result } = renderHook(() =>
        useBulkAutoArchive({
          ...sharedHookArgs,
          filter: "all",
          onDeselectItem,
        }),
      );

      await act(async () => {
        await result.current.onBulkAutoArchive([
          getRow({ name: "first@example.com" }),
          getRow({ name: "second@example.com" }),
          getRow({ name: "third@example.com" }),
        ]);
      });

      expect(setSenderStatusActionMock).toHaveBeenCalledTimes(2);
      expect(queueArchiveSendersMock).toHaveBeenCalledTimes(1);
      expect(onDeselectItem).toHaveBeenCalledOnce();
      expect(onDeselectItem).toHaveBeenCalledWith("first@example.com");
      expect(toastErrorMock).toHaveBeenCalledWith(
        EMAIL_PROVIDER_RATE_LIMIT_MESSAGE,
        expect.objectContaining({
          description: "1 of 3 completed; stopped to avoid more requests",
        }),
      );
    });
  });

  describe("useApproveButton", () => {
    it("approves a sender that has no status", async () => {
      const { result } = renderHook(() =>
        useApproveButton({
          item: getRow(),
          mutate: vi.fn().mockResolvedValue(undefined),
          posthog: { capture: vi.fn() } as never,
          emailAccountId: EMAIL_ACCOUNT_ID,
          filter: "unhandled",
        }),
      );

      await act(async () => {
        await result.current.onApprove();
      });

      expect(setSenderStatusActionMock).toHaveBeenCalledWith(EMAIL_ACCOUNT_ID, {
        senderEmail: SENDER,
        status: NewsletterStatus.APPROVED,
      });
    });

    it("clears the status when unapproving an approved sender", async () => {
      const { result } = renderHook(() =>
        useApproveButton({
          item: getRow({ status: NewsletterStatus.APPROVED }),
          mutate: vi.fn().mockResolvedValue(undefined),
          posthog: { capture: vi.fn() } as never,
          emailAccountId: EMAIL_ACCOUNT_ID,
          filter: "approved",
        }),
      );

      await act(async () => {
        await result.current.onApprove();
      });

      expect(setSenderStatusActionMock).toHaveBeenCalledWith(EMAIL_ACCOUNT_ID, {
        senderEmail: SENDER,
        status: null,
      });
    });
  });

  describe("useUnsubscribe", () => {
    it("clears the status when resubscribing to an unsubscribed sender", async () => {
      const { result } = renderHook(() =>
        useUnsubscribe({
          item: getRow({ status: NewsletterStatus.UNSUBSCRIBED }),
          ...sharedHookArgs,
        }),
      );

      await act(async () => {
        await result.current.onUnsubscribe();
      });

      expect(setSenderStatusActionMock).toHaveBeenCalledWith(EMAIL_ACCOUNT_ID, {
        senderEmail: SENDER,
        status: null,
      });
      expect(unsubscribeSenderActionMock).not.toHaveBeenCalled();
    });

    it("blocks the sender when there is no unsubscribe link to use", async () => {
      const { result } = renderHook(() =>
        useUnsubscribe({ item: getRow(), ...sharedHookArgs }),
      );

      await act(async () => {
        await result.current.onUnsubscribe();
      });

      expect(setSenderStatusActionMock).toHaveBeenCalledWith(EMAIL_ACCOUNT_ID, {
        senderEmail: SENDER,
        status: NewsletterStatus.AUTO_ARCHIVED,
        labelId: undefined,
        labelName: undefined,
      });
      expect(unsubscribeSenderActionMock).not.toHaveBeenCalled();
      expect(queueArchiveSendersMock).toHaveBeenCalledWith({
        senders: [SENDER],
      });
    });

    it("does nothing without unsubscribe access", async () => {
      const { result } = renderHook(() =>
        useUnsubscribe({
          item: getRow(),
          ...sharedHookArgs,
          hasUnsubscribeAccess: false,
        }),
      );

      await act(async () => {
        await result.current.onUnsubscribe();
      });

      expect(setSenderStatusActionMock).not.toHaveBeenCalled();
    });
  });
});
