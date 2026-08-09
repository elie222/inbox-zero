"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { usePostHog } from "posthog-js/react";
import { useAction } from "next-safe-action/hooks";
import { Logo } from "@/components/Logo";
import { EmailStatsPreloader } from "@/components/EmailStatsPreloader";
import { toastError } from "@/components/Toast";
import {
  ChatOnboardingChatPane,
  type ScanCard,
} from "@/app/(app)/[emailAccountId]/onboarding/ChatOnboardingChatPane";
import { OnboardingSetupCard } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingSetupCard";
import {
  OnboardingCleanupCard,
  type CleanupResult,
} from "@/app/(app)/[emailAccountId]/onboarding/OnboardingCleanupCard";
import { OnboardingAccountMenu } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingAccountMenu";
import { OnboardingPlanCards } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingPlanCards";
import {
  applySetupUpdate,
  buildInitialSetup,
  deriveOnboardingFlow,
  STAGE_CHIPS,
  STAGE_QUESTIONS,
  STAGE_STEP,
  TOTAL_STEPS,
  WELCOME_MESSAGE,
  WELCOME_MESSAGE_ID,
  type OnboardingChatMessage,
  type OnboardingStage,
} from "@/app/(app)/[emailAccountId]/onboarding/chatOnboardingConfig";
import { useCompleteOnboarding } from "@/app/(app)/[emailAccountId]/onboarding/useCompleteOnboarding";
import { useInboxScan } from "@/app/(app)/[emailAccountId]/onboarding/useInboxScan";
import { useBulkUnsubscribe } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks";
import type { Newsletter } from "@/app/(app)/[emailAccountId]/onboarding/useInboxScan";
import type {
  OnboardingRuleAction,
  OnboardingSetup,
} from "@/app/api/chat/onboarding/validation";
import type { Tier } from "@/app/(app)/premium/config";
import { saveOnboardingChatAnswersAction } from "@/utils/actions/onboarding";
import { updateEmailAccountRoleAction } from "@/utils/actions/email-account";
import { createRulesOnboardingAction } from "@/utils/actions/rule";
import { generateCheckoutSessionAction } from "@/utils/actions/premium";
import {
  ASSISTANT_ONBOARDING_COOKIE,
  markOnboardingAsCompleted,
} from "@/utils/cookies";
import { completedOnboardingAction } from "@/utils/actions/onboarding";
import { useAccount } from "@/providers/EmailAccountProvider";
import { usePremium } from "@/hooks/usePremium";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import { useOnboardingAnalytics } from "@/hooks/useAnalytics";
import { useSignUpEvent } from "@/hooks/useSignupEvent";
import { assertActionSucceeded, captureException } from "@/utils/error";
import { redirectToSafeUrl } from "@/utils/redirect";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";

const ACTION_EVENT_LABELS: Record<OnboardingRuleAction, string> = {
  label: "Label",
  label_archive: "Label + archive",
  move_folder: "Move to folder",
};

export function ChatOnboarding() {
  const { emailAccountId, provider } = useAccount();
  const posthog = usePostHog();
  const analytics = useOnboardingAnalytics("onboarding-chat");
  const { completeAndRedirect, destination } = useCompleteOnboarding();
  const {
    isPremium,
    hasUnsubscribeAccess,
    mutate: refetchPremium,
    isLoading: isPremiumLoading,
  } = usePremium();
  const { PremiumModal, openModal } = usePremiumModal();

  useSignUpEvent();

  const { scan, suggestions, shownSenders, mutateNewsletters } = useInboxScan({
    emailAccountId,
  });

  const [setup, setSetup] = useState<OnboardingSetup>(() =>
    buildInitialSetup(provider),
  );
  const [scanCardAfterId, setScanCardAfterId] = useState<string | null>(null);
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [submittingUnsubscribe, setSubmittingUnsubscribe] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(
    null,
  );
  const [finishing, setFinishing] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const setupRef = useRef(setup);
  const scanRef = useRef(scan);
  const isPremiumRef = useRef(Boolean(isPremium));
  setupRef.current = setup;
  scanRef.current = scan;
  isPremiumRef.current = Boolean(isPremium);

  const chat = useChat<OnboardingChatMessage>({
    transport: new DefaultChatTransport({
      api: "/api/chat/onboarding",
      headers: { [EMAIL_ACCOUNT_HEADER]: emailAccountId },
      prepareSendMessagesRequest({ messages }) {
        return {
          body: {
            messages,
            setup: setupRef.current,
            scan: scanRef.current,
            isPremium: isPremiumRef.current,
          },
        };
      },
    }),
    experimental_throttle: 80,
    onError: (error) => {
      captureException(error, {
        extra: { context: "chat-onboarding", step: "chat-request" },
      });
      toastError({
        description: "We couldn't send that. Please try again.",
      });
    },
  });

  const messages = chat.messages;
  const { stage, setupCardToolCallId, cleanupCardToolCallId } = useMemo(
    () => deriveOnboardingFlow(messages),
    [messages],
  );
  const busy = chat.status === "submitted" || chat.status === "streaming";

  const storageKey = `inbox-zero-onboarding-chat-v2:${emailAccountId}`;

  // Restore an in-progress conversation after a reload, or seed the fixed
  // welcome message so the chat opens instantly with no LLM call.
  const startedRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const restored = readStoredConversation(storageKey);
    if (restored) {
      // Prime the derived-state guards before setting messages so restore
      // doesn't re-run tool effects, stage side effects, or the scan nudge
      for (const message of restored.messages) {
        for (const part of message.parts) {
          if (
            part.type === "tool-updateSetup" &&
            part.state === "output-available"
          ) {
            appliedToolCallsRef.current.add(part.toolCallId);
          }
        }
      }
      const flow = deriveOnboardingFlow(restored.messages);
      prevStageRef.current = flow.stage;
      answersRef.current = restored.answers;
      setupRef.current = restored.setup;
      setSetup(restored.setup);
      setCleanupResult(restored.cleanupResult);
      setScanCardAfterId(restored.scanCardAfterId);
      setDeselected(new Set(restored.deselected));
      if (restored.setup.status === "live") {
        rulesCreationRef.current = Promise.resolve(true);
      }
      chat.setMessages(restored.messages);
      // A reload can interrupt rule creation; upserts make retrying safe
      if (flow.stage === "close" && restored.setup.status !== "live") {
        createRules();
      }
      // A reload mid-request leaves a trailing user turn with no reply;
      // resubmit so the conversation picks up where it left off
      const lastMessage = restored.messages.at(-1);
      if (lastMessage?.role === "user") {
        chat.regenerate();
      }
      return;
    }

    chat.setMessages([
      {
        id: WELCOME_MESSAGE_ID,
        role: "assistant",
        parts: [{ type: "text", text: WELCOME_MESSAGE }],
      },
    ]);
    analytics.onStart({ step: 1, stepKey: "welcome", totalSteps: TOTAL_STEPS });
  }, []);

  const lastWrittenRef = useRef<{
    tailId: string | undefined;
    count: number;
    setup: OnboardingSetup;
    cleanupResult: CleanupResult | null;
    scanCardAfterId: string | null;
    deselected: Set<string>;
  } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: persists conversation state between reloads
  useEffect(() => {
    if (!startedRef.current) return;
    // While a response is in flight, persist up to the last user turn so a
    // reload never drops the just-sent answer or keeps a half-finished reply
    const persistable =
      chat.status === "ready"
        ? messages
        : messages.slice(
            0,
            messages.findLastIndex((message) => message.role === "user") + 1,
          );
    if (persistable.length <= 1) return;

    // Streamed tokens change the messages array without changing what gets
    // persisted; skip the byte-identical serialize-and-write per token
    const previous = lastWrittenRef.current;
    const tailId = persistable.at(-1)?.id;
    if (
      previous &&
      previous.tailId === tailId &&
      previous.count === persistable.length &&
      previous.setup === setup &&
      previous.cleanupResult === cleanupResult &&
      previous.scanCardAfterId === scanCardAfterId &&
      previous.deselected === deselected
    ) {
      return;
    }
    lastWrittenRef.current = {
      tailId,
      count: persistable.length,
      setup,
      cleanupResult,
      scanCardAfterId,
      deselected,
    };

    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          messages: persistable,
          setup,
          cleanupResult,
          scanCardAfterId,
          deselected: [...deselected],
          answers: answersRef.current,
        }),
      );
    } catch {
      // Storage may be full or unavailable; losing resume support is fine
    }
  }, [
    messages,
    chat.status,
    setup,
    cleanupResult,
    scanCardAfterId,
    deselected,
  ]);

  // Rebuild the default draft if the provider resolves late, but never after
  // the setup is on screen. Skips the mount run: it would see the pre-restore
  // "welcome" stage and clobber a restored setup with defaults.
  const providerRef = useRef(provider);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only reacts to provider changes
  useEffect(() => {
    if (providerRef.current === provider) return;
    providerRef.current = provider;
    if (stage === "welcome" || stage === "discovery" || stage === "guess") {
      setSetup(buildInitialSetup(provider));
    }
  }, [provider]);

  const appliedToolCallsRef = useRef(new Set<string>());
  useEffect(() => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (
          part.type === "tool-updateSetup" &&
          part.state === "output-available" &&
          part.output.ok &&
          !appliedToolCallsRef.current.has(part.toolCallId)
        ) {
          appliedToolCallsRef.current.add(part.toolCallId);
          // Update the ref eagerly too: the close-stage effect can run in the
          // same commit and must create rules from the post-edit setup
          setupRef.current = applySetupUpdate(setupRef.current, part.output);
          setSetup(setupRef.current);
        }
      }
    }
  }, [messages]);

  const prevStageRef = useRef<OnboardingStage>("welcome");
  // biome-ignore lint/correctness/useExhaustiveDependencies: analytics/createRules are stable enough; the ref guards re-entry
  useEffect(() => {
    if (stage === prevStageRef.current) return;
    prevStageRef.current = stage;
    analytics.onStepViewed({
      stepKey: stage,
      step: STAGE_STEP[stage],
      totalSteps: TOTAL_STEPS,
    });
    if (stage === "close") createRules();
  }, [stage]);

  const rulesCreationRef = useRef<Promise<boolean> | null>(null);
  const createRules = () => {
    if (rulesCreationRef.current) return;
    const configs = setupRef.current.rules
      .filter((rule) => rule.enabled)
      .map((rule) => ({
        name: rule.key ?? rule.name,
        description: rule.description,
        action: rule.action,
        key: rule.key,
      }));
    setSetup((current) => ({ ...current, status: "enabling" }));
    rulesCreationRef.current = createRulesOnboardingAction(
      emailAccountId,
      // Cast: key is a SystemType for the standard rules and null for custom ones
      configs as Parameters<typeof createRulesOnboardingAction>[1],
    )
      .then((result) => {
        assertActionSucceeded(result);
        posthog?.capture("onboarding_chat_rules_created", {
          variant: "onboarding-chat",
          count: configs.length,
        });
        setSetup((current) => ({ ...current, status: "live" }));
        return true;
      })
      .catch((error) => {
        captureException(error, {
          extra: { context: "chat-onboarding", step: "create-rules" },
        });
        setSetup((current) => ({ ...current, status: "error" }));
        return false;
      });
  };

  // Answer persistence: the accumulated transcript is saved after every answer
  // so partial data survives abandonment.
  const { executeAsync: saveRole } = useAction(
    updateEmailAccountRoleAction.bind(null, emailAccountId),
  );
  const { executeAsync: saveAnswers } = useAction(
    saveOnboardingChatAnswersAction,
  );
  const { executeAsync: completeOnboarding } = useAction(
    completedOnboardingAction,
  );
  const answersRef = useRef<
    { key: string; question: string; answer: string; isFreeform: boolean }[]
  >([]);
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const recordAnswer = (
    stageAtSend: OnboardingStage,
    answer: string,
    isFreeform: boolean,
  ) => {
    answersRef.current = [
      ...answersRef.current,
      {
        key: stageAtSend,
        question: STAGE_QUESTIONS[stageAtSend],
        answer,
        isFreeform,
      },
    ];

    posthog?.capture("onboarding_chat_answer", {
      variant: "onboarding-chat",
      beat: stageAtSend,
      answer,
      isFreeform,
    });
    analytics.onNext({
      stepKey: stageAtSend,
      step: STAGE_STEP[stageAtSend],
      totalSteps: TOTAL_STEPS,
    });

    const answers = answersRef.current;
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (stageAtSend === "welcome") {
          const roleResult = await saveRole({
            role: answer.slice(0, 100),
            writeOnboardingAnswers: false,
          });
          assertActionSucceeded(roleResult);
        }
        const answersResult = await saveAnswers({ answers });
        assertActionSucceeded(answersResult);
      })
      .catch((error) => {
        captureException(error, {
          extra: {
            context: "chat-onboarding",
            step: "save-answers",
            key: stageAtSend,
          },
        });
      });
  };

  // Manual panel edits queue up as [panel] events and ride along with the next
  // request, so the model always knows what the user changed by hand.
  const pendingPanelEventsRef = useRef<string[]>([]);

  const flushPanelEvents = () => {
    const events = pendingPanelEventsRef.current;
    if (!events.length) return;
    pendingPanelEventsRef.current = [];
    chat.setMessages([
      ...chat.messages,
      ...events.map(
        (text): OnboardingChatMessage => ({
          id: generateMessageId(),
          role: "user",
          metadata: { hidden: true },
          parts: [{ type: "text", text }],
        }),
      ),
    ]);
  };

  const sendHiddenEvent = (text: string) => {
    flushPanelEvents();
    chat.sendMessage({
      role: "user",
      metadata: { hidden: true },
      parts: [{ type: "text", text }],
    });
  };

  const send = (text: string, isFreeform: boolean) => {
    if (busy || finishing || checkingOut) return;
    const stageAtSend = stage;
    flushPanelEvents();
    recordAnswer(stageAtSend, text, isFreeform);

    const id = generateMessageId();
    if (stageAtSend === "guess" && !scanCardAfterId) setScanCardAfterId(id);
    chat.sendMessage({ id, role: "user", parts: [{ type: "text", text }] });
  };

  // If the scan was still running when the user guessed, nudge the model to do
  // the reveal as soon as it finishes.
  const scanEventSentRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: guarded one-shot continuation
  useEffect(() => {
    if (scanEventSentRef.current) return;
    if (stage !== "guess" || !scanCardAfterId) return;
    if (scan.status === "pending" || chat.status !== "ready") return;
    if (messages.at(-1)?.role !== "assistant") return;
    scanEventSentRef.current = true;
    sendHiddenEvent(
      "[event] The inbox scan finished; results are in the state snapshot. Continue to the draft.",
    );
  }, [stage, scan.status, chat.status, messages, scanCardAfterId]);

  // Unsubscribe: clicks only, never driven by chat text
  const { onBulkUnsubscribe } = useBulkUnsubscribe<Newsletter>({
    hasUnsubscribeAccess,
    mutate: mutateNewsletters,
    posthog,
    refetchPremium,
    emailAccountId,
    filter: "unhandled",
  });

  const selectedSenders = shownSenders.filter(
    (sender) => !deselected.has(sender.name),
  );

  const onUnsubscribeSelected = async () => {
    if (stage !== "cleanup" || submittingUnsubscribe || cleanupResult || busy)
      return;

    if (!selectedSenders.length) {
      setCleanupResult({ unsubscribedCount: 0, keptAll: true, failedCount: 0 });
      sendHiddenEvent(
        "[event] The user chose to keep all suggested senders. Continue to the close.",
      );
      return;
    }

    posthog?.capture("onboarding_unsubscribe_cta_clicked", {
      variant: "onboarding-chat",
      selectedCount: selectedSenders.length,
      totalSuggestions: suggestions.length,
      hasUnsubscribeAccess,
    });

    if (!hasUnsubscribeAccess) {
      posthog?.capture("onboarding_unsubscribe_upgrade_prompt_shown", {
        variant: "onboarding-chat",
        selectedCount: selectedSenders.length,
        totalSuggestions: suggestions.length,
      });
      openModal();
      return;
    }

    setSubmittingUnsubscribe(true);
    let successCount = 0;
    let failureCount = 0;
    try {
      const result = await onBulkUnsubscribe(selectedSenders);
      successCount = result?.successCount ?? selectedSenders.length;
      failureCount = result?.failureCount ?? 0;
    } finally {
      setSubmittingUnsubscribe(false);
    }

    setCleanupResult({
      unsubscribedCount: successCount,
      keptAll: false,
      failedCount: failureCount,
    });
    sendHiddenEvent(
      `[event] Unsubscribed from ${successCount} of the suggested senders.${
        failureCount > 0
          ? ` ${failureCount} could not be completed; the user can retry from Bulk Unsubscribe in the app.`
          : ""
      } Continue to the close.`,
    );
  };

  const awaitPendingWork = () =>
    Promise.all([
      saveQueueRef.current,
      rulesCreationRef.current ?? Promise.resolve(),
    ]);

  const clearStoredConversation = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  };

  const onFinish = async () => {
    if (finishing) return;
    setFinishing(true);
    analytics.onComplete({
      step: TOTAL_STEPS,
      stepKey: "close",
      totalSteps: TOTAL_STEPS,
      destination,
    });
    await awaitPendingWork();
    const completed = await completeAndRedirect();
    if (completed) clearStoredConversation();
    setFinishing(false);
  };

  const onPickPlan = async (tier: Tier) => {
    posthog?.capture("onboarding_chat_plan_selected", {
      variant: "onboarding-chat",
      tier: tier.name,
    });
    setCheckingOut(true);
    try {
      await awaitPendingWork();

      // Mark onboarding complete before leaving for Stripe so finishing
      // checkout lands in the app, not back here.
      try {
        const result = await completeOnboarding();
        assertActionSucceeded(result);
        markOnboardingAsCompleted(ASSISTANT_ONBOARDING_COOKIE);
      } catch (error) {
        captureException(error, {
          extra: {
            context: "chat-onboarding",
            step: "complete-before-checkout",
          },
        });
      }

      const result = await generateCheckoutSessionAction({
        tier: tier.tiers.monthly,
      });
      if (!result?.data?.url) {
        toastError({ description: "Error creating checkout session" });
        setCheckingOut(false);
        return;
      }
      clearStoredConversation();
      redirectToSafeUrl(result.data.url, { allowExternal: true });
    } catch (error) {
      captureException(error, {
        extra: { context: "chat-onboarding", step: "checkout" },
      });
      toastError({ description: "Error creating checkout session" });
      setCheckingOut(false);
    }
  };

  const onChangeRuleAction = (name: string, action: OnboardingRuleAction) => {
    setSetup((current) => ({
      ...current,
      rules: current.rules.map((rule) =>
        rule.name === name ? { ...rule, action } : rule,
      ),
    }));
    pendingPanelEventsRef.current.push(
      `[panel] The user changed the "${name}" rule action to ${ACTION_EVENT_LABELS[action]}.`,
    );
  };

  const onToggleRule = (name: string) => {
    const rule = setup.rules.find((r) => r.name === name);
    if (!rule) return;
    setSetup((current) => ({
      ...current,
      rules: current.rules.map((r) =>
        r.name === name ? { ...r, enabled: !r.enabled } : r,
      ),
    }));
    pendingPanelEventsRef.current.push(
      `[panel] The user turned the "${name}" rule ${rule.enabled ? "off" : "on"}.`,
    );
  };

  const onToggleSender = (name: string) => {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: fire once per stage entry
  useEffect(() => {
    if (stage === "cleanup" && shownSenders.length > 0) {
      posthog?.capture("onboarding_unsubscribe_suggestions_shown", {
        variant: "onboarding-chat",
        shownCount: shownSenders.length,
        totalSuggestions: suggestions.length,
      });
    }
  }, [stage]);

  const scanCard: ScanCard | null = scanCardAfterId
    ? {
        afterMessageId: scanCardAfterId,
        state: scan.status === "pending" ? "running" : "done",
        summary:
          scan.emailsLastMonth != null
            ? `${scan.emailsLastMonth.toLocaleString()} emails in the last month · ${
                scan.totalCleanupSuggestions
              } senders you rarely open`
            : null,
      }
    : null;

  const chips =
    (stage === "close" && isPremium) || checkingOut || finishing
      ? []
      : (STAGE_CHIPS[stage] ?? []);

  const inlineCards: Record<string, React.ReactNode> = {};
  if (setupCardToolCallId) {
    inlineCards[setupCardToolCallId] = (
      <OnboardingSetupCard
        setup={setup}
        provider={provider}
        editable={
          setup.status === "draft" && (stage === "draft" || stage === "cleanup")
        }
        onChangeAction={onChangeRuleAction}
        onToggleRule={onToggleRule}
      />
    );
  }
  if (cleanupCardToolCallId && shownSenders.length > 0) {
    inlineCards[cleanupCardToolCallId] = (
      <OnboardingCleanupCard
        senders={shownSenders}
        deselected={deselected}
        onToggleSender={onToggleSender}
        selectedCount={selectedSenders.length}
        onUnsubscribe={onUnsubscribeSelected}
        // Also parked while the assistant streams so the completion event
        // can't race an in-flight chat request
        submitting={submittingUnsubscribe || isPremiumLoading || busy}
        result={cleanupResult}
      />
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <EmailStatsPreloader />

      <header className="flex h-14 shrink-0 items-center justify-between border-b px-5">
        <Logo className="h-4 w-auto text-foreground" />
        <OnboardingAccountMenu />
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 justify-center">
          <div className="flex w-full max-w-2xl flex-col px-5">
            <ChatOnboardingChatPane
              messages={messages}
              status={chat.status}
              chips={chips}
              onSend={send}
              scanCard={scanCard}
              belowConversation={
                stage === "close" && !isPremium && !isPremiumLoading ? (
                  <div className="flex flex-col gap-3">
                    <OnboardingPlanCards
                      onPick={onPickPlan}
                      disabled={finishing || checkingOut}
                    />
                    <button
                      type="button"
                      className="self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
                      onClick={onFinish}
                      disabled={finishing || checkingOut}
                    >
                      I'll decide later
                    </button>
                  </div>
                ) : null
              }
              cta={
                stage === "close" && isPremium && !isPremiumLoading
                  ? {
                      label: "Continue setup",
                      loading: finishing,
                      onClick: onFinish,
                    }
                  : null
              }
              inputDisabled={finishing || checkingOut}
              inlineCards={inlineCards}
            />
          </div>
        </div>
      </div>

      <PremiumModal />
    </div>
  );
}

type StoredConversation = {
  messages: OnboardingChatMessage[];
  setup: OnboardingSetup;
  cleanupResult: CleanupResult | null;
  scanCardAfterId: string | null;
  deselected: string[];
  answers: {
    key: string;
    question: string;
    answer: string;
    isFreeform: boolean;
  }[];
};

function readStoredConversation(key: string): StoredConversation | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !Array.isArray(parsed?.messages) ||
      parsed.messages.length <= 1 ||
      !Array.isArray(parsed.setup?.rules) ||
      !Array.isArray(parsed.answers)
    ) {
      return null;
    }
    return {
      messages: parsed.messages,
      setup: parsed.setup,
      cleanupResult: parsed.cleanupResult
        ? {
            unsubscribedCount: parsed.cleanupResult.unsubscribedCount ?? 0,
            keptAll: parsed.cleanupResult.keptAll ?? false,
            failedCount: parsed.cleanupResult.failedCount ?? 0,
          }
        : null,
      scanCardAfterId: parsed.scanCardAfterId ?? null,
      deselected: Array.isArray(parsed.deselected) ? parsed.deselected : [],
      answers: parsed.answers,
    };
  } catch {
    return null;
  }
}

function generateMessageId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
