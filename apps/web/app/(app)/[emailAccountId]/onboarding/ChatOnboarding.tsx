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
import { ChatOnboardingSetupPanel } from "@/app/(app)/[emailAccountId]/onboarding/ChatOnboardingSetupPanel";
import { OnboardingAccountMenu } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingAccountMenu";
import { OnboardingPlanCards } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingPlanCards";
import {
  applySetupUpdate,
  buildInitialSetup,
  getStageFromMessages,
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
  const [cleanupResult, setCleanupResult] = useState<{
    unsubscribedCount: number;
  } | null>(null);
  const [finishing, setFinishing] = useState(false);

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
  const stage = useMemo(() => getStageFromMessages(messages), [messages]);
  const busy = chat.status === "submitted" || chat.status === "streaming";

  // Seed the fixed welcome message so the chat opens instantly, with no LLM
  // call until the user answers.
  const startedRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    chat.setMessages([
      {
        id: WELCOME_MESSAGE_ID,
        role: "assistant",
        parts: [{ type: "text", text: WELCOME_MESSAGE }],
      },
    ]);
    analytics.onStart({ step: 1, stepKey: "welcome", totalSteps: TOTAL_STEPS });
  }, []);

  // Rebuild the default draft if the provider resolves late, but never after
  // the setup is on screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only reacts to provider changes
  useEffect(() => {
    if (stage === "welcome" || stage === "discovery" || stage === "guess") {
      setSetup(buildInitialSetup(provider));
    }
  }, [provider]);

  // Apply the model's setup edits (tool outputs) to the shared draft, once each
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
          const output = part.output;
          setSetup((current) => applySetupUpdate(current, output));
        }
      }
    }
  }, [messages]);

  // Stage transitions: analytics plus turning the rules on at close
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
    if (busy || finishing) return;
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
      "[event] The inbox scan finished. Continue with the reveal and the draft.",
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
    if (stage !== "cleanup" || submittingUnsubscribe || cleanupResult) return;

    if (!selectedSenders.length) {
      setCleanupResult({ unsubscribedCount: 0 });
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

    setCleanupResult({ unsubscribedCount: successCount });
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
    await completeAndRedirect();
    setFinishing(false);
  };

  const onPickPlan = async (tier: Tier) => {
    posthog?.capture("onboarding_chat_plan_selected", {
      variant: "onboarding-chat",
      tier: tier.name,
    });
    await awaitPendingWork();

    // Mark onboarding complete before leaving for Stripe so finishing checkout
    // lands in the app, not back here.
    try {
      const result = await completeOnboarding();
      assertActionSucceeded(result);
      markOnboardingAsCompleted(ASSISTANT_ONBOARDING_COOKIE);
    } catch (error) {
      captureException(error, {
        extra: { context: "chat-onboarding", step: "complete-before-checkout" },
      });
    }

    try {
      const result = await generateCheckoutSessionAction({
        tier: tier.tiers.monthly,
      });
      if (!result?.data?.url) {
        toastError({ description: "Error creating checkout session" });
        return;
      }
      redirectToSafeUrl(result.data.url, { allowExternal: true });
    } catch (error) {
      captureException(error, {
        extra: { context: "chat-onboarding", step: "checkout" },
      });
      toastError({ description: "Error creating checkout session" });
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

  const panelVisible =
    stage === "draft" || stage === "cleanup" || stage === "close";

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
    stage === "close" && isPremium ? [] : (STAGE_CHIPS[stage] ?? []);

  const renderPanel = (className?: string) => (
    <ChatOnboardingSetupPanel
      className={className}
      setup={setup}
      provider={provider}
      editable={
        setup.status === "draft" && (stage === "draft" || stage === "cleanup")
      }
      onChangeAction={onChangeRuleAction}
      onToggleRule={onToggleRule}
      cleanup={{
        visible:
          (stage === "cleanup" || (stage === "close" && !!cleanupResult)) &&
          shownSenders.length > 0,
        senders: shownSenders,
        deselected,
        onToggleSender,
        selectedCount: selectedSenders.length,
        onUnsubscribe: onUnsubscribeSelected,
        submitting: submittingUnsubscribe || isPremiumLoading,
        result: cleanupResult,
      }}
    />
  );

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
                stage === "close" && !isPremium ? (
                  <div className="flex flex-col gap-3">
                    <OnboardingPlanCards
                      onPick={onPickPlan}
                      disabled={finishing}
                    />
                    <button
                      type="button"
                      className="self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
                      onClick={onFinish}
                      disabled={finishing}
                    >
                      I'll decide later
                    </button>
                  </div>
                ) : null
              }
              cta={
                stage === "close" && isPremium
                  ? {
                      label: "Open my inbox",
                      loading: finishing,
                      onClick: onFinish,
                    }
                  : null
              }
              inlinePanel={
                panelVisible ? renderPanel("rounded-xl border") : undefined
              }
            />
          </div>
        </div>

        {panelVisible && (
          <aside className="hidden w-[440px] shrink-0 border-l duration-500 animate-in slide-in-from-right lg:flex">
            {renderPanel("flex-1")}
          </aside>
        )}
      </div>

      <PremiumModal />
    </div>
  );
}

function generateMessageId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
