"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { subDays } from "date-fns/subDays";
import { startOfDay } from "date-fns/startOfDay";
import { usePostHog } from "posthog-js/react";
import { useAction } from "next-safe-action/hooks";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { EmailStatsPreloader } from "@/components/EmailStatsPreloader";
import {
  ChatOnboardingChatPane,
  type ChatOnboardingMessage,
} from "@/app/(app)/[emailAccountId]/onboarding/ChatOnboardingChatPane";
import { ChatOnboardingArtifact } from "@/app/(app)/[emailAccountId]/onboarding/ChatOnboardingArtifact";
import {
  CHAT_BEATS,
  getArtifactMode,
  getChatOnboardingCategories,
  KEEP_NOTED_MESSAGE,
  LABELS_NOTED_MESSAGE,
  LABELS_TWEAK_CHIP,
  RULES_NOTED_MESSAGE,
  RULES_TWEAK_CHIP,
  type ChatAnswers,
  type ChatBeatKey,
} from "@/app/(app)/[emailAccountId]/onboarding/chatOnboardingScript";
import { useCompleteOnboarding } from "@/app/(app)/[emailAccountId]/onboarding/useCompleteOnboarding";
import { getUnsubscribeSuggestions } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/suggestions";
import { useBulkUnsubscribe } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks";
import type {
  NewsletterStatsQuery,
  NewsletterStatsResponse,
} from "@/app/api/user/stats/newsletters/route";
import { saveOnboardingChatAnswersAction } from "@/utils/actions/onboarding";
import { updateEmailAccountRoleAction } from "@/utils/actions/email-account";
import { createRulesOnboardingAction } from "@/utils/actions/rule";
import { categoryConfig } from "@/utils/category-config";
import { useAccount } from "@/providers/EmailAccountProvider";
import { usePremium } from "@/hooks/usePremium";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import { useOnboardingAnalytics } from "@/hooks/useAnalytics";
import { useSignUpEvent } from "@/hooks/useSignupEvent";
import { assertActionSucceeded, captureException } from "@/utils/error";
import { createSearchParams } from "@/utils/url";

type Newsletter = NewsletterStatsResponse["newsletters"][number];

const SHOWN_UNSUBSCRIBE_COUNT = 6;
// If newsletter stats haven't loaded by the time the conversation reaches
// cleanup, give up waiting and finish without the unsubscribe beat.
const STATS_WAIT_TIMEOUT_MS = 15_000;

const FIRST_MESSAGE_DELAY_MS = 700;

const BEAT_STEP: Record<ChatBeatKey, number> = {
  role: 1,
  struggle: 2,
  volume: 3,
  labels: 4,
  labelsTweak: 4,
  rules: 5,
  rulesTweak: 5,
  unsubscribe: 6,
  done: 7,
};
const TOTAL_STEPS = 7;

type DoneContext = {
  unsubscribedFromCount: number;
  skippedCleanup: boolean;
  setupSucceeded: boolean;
};

export function ChatOnboarding() {
  const { emailAccountId, provider } = useAccount();
  const posthog = usePostHog();
  const analytics = useOnboardingAnalytics("onboarding-chat");
  const { completeAndRedirect, destination } = useCompleteOnboarding();
  const {
    hasUnsubscribeAccess,
    mutate: refetchPremium,
    isLoading: isPremiumLoading,
  } = usePremium();
  const { PremiumModal, openModal } = usePremiumModal();

  useSignUpEvent();

  // Same query as the bulk-unsubscribe onboarding step; EmailStatsPreloader
  // starts ingesting stats early so data is ready by the cleanup beat.
  const fromDate = useMemo(() => +subDays(startOfDay(new Date()), 90), []);
  const params: NewsletterStatsQuery = {
    types: [],
    filters: ["unhandled"],
    orderBy: "emails",
    orderDirection: "desc",
    limit: 50,
    includeMissingUnsubscribe: true,
    fromDate,
  };
  const urlParams = createSearchParams(params);
  const {
    data,
    isLoading: isStatsLoading,
    error: statsError,
    mutate,
  } = useSWR<NewsletterStatsResponse>(
    emailAccountId
      ? [`/api/user/stats/newsletters?${urlParams}`, emailAccountId]
      : null,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
    },
  );

  const suggestions = useMemo(
    () =>
      getUnsubscribeSuggestions(data?.newsletters ?? [], {
        requireAutomaticUnsubscribeLink: true,
      }),
    [data],
  );
  const shownSenders = useMemo(
    () => suggestions.slice(0, SHOWN_UNSUBSCRIBE_COUNT),
    [suggestions],
  );

  const { onBulkUnsubscribe } = useBulkUnsubscribe<Newsletter>({
    hasUnsubscribeAccess,
    mutate,
    posthog,
    refetchPremium,
    emailAccountId,
    filter: "unhandled",
  });

  const categories = useMemo(
    () => getChatOnboardingCategories(provider),
    [provider],
  );

  const [messages, setMessages] = useState<ChatOnboardingMessage[]>([]);
  const [beat, setBeat] = useState<ChatBeatKey | "cleanupPending">("role");
  const [typing, setTyping] = useState(false);
  const [awaiting, setAwaiting] = useState(false);
  const [pendingCleanup, setPendingCleanup] = useState<{
    preMessages: string[];
  } | null>(null);
  const [statsTimedOut, setStatsTimedOut] = useState(false);
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [submittingUnsubscribe, setSubmittingUnsubscribe] = useState(false);
  const [doneContext, setDoneContext] = useState<DoneContext>({
    unsubscribedFromCount: 0,
    skippedCleanup: false,
    setupSucceeded: false,
  });
  const [finishing, setFinishing] = useState(false);

  const messageIdRef = useRef(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const answersRef = useRef<
    { key: string; question: string; answer: string; isFreeform: boolean }[]
  >([]);
  const answersByKeyRef = useRef<ChatAnswers>({});
  const saveAnswersQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const rulesCreationRef = useRef<Promise<boolean> | null>(null);

  const { executeAsync: saveRole } = useAction(
    updateEmailAccountRoleAction.bind(null, emailAccountId),
  );
  const { executeAsync: saveAnswers } = useAction(
    saveOnboardingChatAnswersAction,
  );

  const pushMessage = (from: "assistant" | "user", text: string) => {
    messageIdRef.current += 1;
    const id = messageIdRef.current;
    setMessages((prev) => [...prev, { id, from, text }]);
  };

  const deliver = (
    key: ChatBeatKey,
    ctx?: Partial<DoneContext> & { unsubscribeCount?: number },
    preMessages: string[] = [],
  ) => {
    const beatDef = CHAT_BEATS[key];
    const text = [
      ...preMessages,
      ...beatDef.messages({
        answers: answersByKeyRef.current,
        unsubscribeCount: ctx?.unsubscribeCount ?? 0,
        unsubscribedFromCount: ctx?.unsubscribedFromCount ?? 0,
        skippedCleanup: ctx?.skippedCleanup ?? false,
        setupSucceeded: ctx?.setupSucceeded ?? false,
      }),
    ].join(" ");

    setBeat(key);
    setTyping(true);
    setAwaiting(false);
    analytics.onStepViewed({
      stepKey: key,
      step: BEAT_STEP[key],
      totalSteps: TOTAL_STEPS,
    });

    const timeout = setTimeout(() => {
      pushMessage("assistant", text);
      setTyping(false);
      setAwaiting(Boolean(beatDef.chips || beatDef.placeholder));
    }, FIRST_MESSAGE_DELAY_MS);
    timeoutsRef.current.push(timeout);
  };

  const goToDone = async (
    ctx: Omit<DoneContext, "setupSucceeded">,
    preMessages: string[] = [],
  ) => {
    const setupSucceeded = await (rulesCreationRef.current ??
      Promise.resolve(false));
    const doneContext = { ...ctx, setupSucceeded };
    setDoneContext(doneContext);
    deliver("done", doneContext, preMessages);
  };

  const recordAnswer = (
    key: ChatBeatKey,
    answer: string,
    isFreeform: boolean,
  ) => {
    answersByKeyRef.current = { ...answersByKeyRef.current, [key]: answer };
    answersRef.current = [
      ...answersRef.current,
      { key, question: CHAT_BEATS[key].question, answer, isFreeform },
    ];

    posthog?.capture("onboarding_chat_answer", {
      variant: "onboarding-chat",
      beat: key,
      answer,
      isFreeform,
    });
    analytics.onNext({
      stepKey: key,
      step: BEAT_STEP[key],
      totalSteps: TOTAL_STEPS,
    });

    const answers = answersRef.current;
    saveAnswersQueueRef.current = saveAnswersQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (key === "role") {
          const roleResult = await saveRole({
            role: answer,
            writeOnboardingAnswers: false,
          });
          assertActionSucceeded(roleResult);
        }

        const answersResult = await saveAnswers({ answers });
        assertActionSucceeded(answersResult);
      })
      .catch((error) => {
        captureException(error, {
          extra: { context: "chat-onboarding", step: "save-answers", key },
        });
      });
  };

  const createRules = () => {
    if (rulesCreationRef.current) return;
    const configs = categoryConfig(provider).map((category) => ({
      name: category.key,
      description: "",
      action: category.action,
      key: category.key,
    }));
    rulesCreationRef.current = createRulesOnboardingAction(
      emailAccountId,
      configs,
    )
      .then((result) => {
        assertActionSucceeded(result);
        posthog?.capture("onboarding_chat_rules_created", {
          variant: "onboarding-chat",
          count: configs.length,
        });
        return true;
      })
      .catch((error) => {
        captureException(error, {
          extra: { context: "chat-onboarding", step: "create-rules" },
        });
        return false;
      });
  };

  const goToCleanup = (preMessages: string[]) => {
    setBeat("cleanupPending");
    setTyping(true);
    setAwaiting(false);
    setPendingCleanup({ preMessages });
  };

  const respond = async (text: string, isFreeform: boolean) => {
    if (!awaiting || beat === "cleanupPending") return;
    const currentBeat = beat;

    setAwaiting(false);
    pushMessage("user", text);
    recordAnswer(currentBeat, text, isFreeform);

    switch (currentBeat) {
      case "role":
        deliver("struggle");
        break;
      case "struggle":
        deliver("volume");
        break;
      case "volume":
        deliver("labels");
        break;
      case "labels":
        if (text === LABELS_TWEAK_CHIP) deliver("labelsTweak");
        else if (isFreeform)
          deliver("rules", undefined, [LABELS_NOTED_MESSAGE]);
        else deliver("rules");
        break;
      case "labelsTweak":
        deliver("rules", undefined, [LABELS_NOTED_MESSAGE]);
        break;
      case "rules":
        if (text === RULES_TWEAK_CHIP) {
          deliver("rulesTweak");
        } else {
          if (!isFreeform) createRules();
          goToCleanup(isFreeform ? [RULES_NOTED_MESSAGE] : []);
        }
        break;
      case "rulesTweak":
        goToCleanup([RULES_NOTED_MESSAGE]);
        break;
      case "unsubscribe":
        // We can't reliably act on a typed keep-list without an LLM, so keep
        // everything — never unsubscribe on a guess.
        await goToDone({ unsubscribedFromCount: 0, skippedCleanup: false }, [
          KEEP_NOTED_MESSAGE,
        ]);
        break;
      case "done":
        break;
    }
  };

  // Resolve the cleanup beat once newsletter stats are ready (or we give up)
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliver/goToDone are recreated every render; the pendingCleanup guard prevents re-entry
  useEffect(() => {
    if (!pendingCleanup) return;

    const statsReady = Boolean(data) || Boolean(statsError) || !isStatsLoading;
    if (!statsReady && !statsTimedOut) return;

    setPendingCleanup(null);
    const pre = pendingCleanup.preMessages;

    if (shownSenders.length > 0) {
      posthog?.capture("onboarding_unsubscribe_suggestions_shown", {
        variant: "onboarding-chat",
        shownCount: shownSenders.length,
        totalSuggestions: suggestions.length,
      });
      deliver("unsubscribe", { unsubscribeCount: suggestions.length }, pre);
    } else if (data && !statsError) {
      goToDone({ unsubscribedFromCount: 0, skippedCleanup: true }, pre);
    } else {
      // Stats unavailable — finish without claiming the inbox is clean
      goToDone({ unsubscribedFromCount: 0, skippedCleanup: false }, pre);
    }
  }, [
    pendingCleanup,
    data,
    statsError,
    isStatsLoading,
    statsTimedOut,
    shownSenders.length,
    suggestions.length,
  ]);

  useEffect(() => {
    if (!pendingCleanup) return;
    const timeout = setTimeout(
      () => setStatsTimedOut(true),
      STATS_WAIT_TIMEOUT_MS,
    );
    return () => clearTimeout(timeout);
  }, [pendingCleanup]);

  // Kick off the conversation once on mount
  const startedRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    analytics.onStart({ step: 1, stepKey: "role", totalSteps: TOTAL_STEPS });
    deliver("role");
  }, []);

  useEffect(
    () => () => {
      for (const timeout of timeoutsRef.current) clearTimeout(timeout);
    },
    [],
  );

  const selectedSenders = shownSenders.filter(
    (sender) => !deselected.has(sender.name),
  );

  const onToggleSender = (name: string) => {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const onUnsubscribeSelected = async () => {
    if (beat !== "unsubscribe" || submittingUnsubscribe) return;

    if (!selectedSenders.length) {
      setAwaiting(false);
      pushMessage("user", "Keep them all");
      recordAnswer("unsubscribe", "Keep them all", false);
      await goToDone({
        unsubscribedFromCount: 0,
        skippedCleanup: false,
      });
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

    setAwaiting(false);
    const answer = `Unsubscribe from ${selectedSenders.length}`;
    pushMessage("user", answer);
    recordAnswer("unsubscribe", answer, false);

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
    const preMessages =
      failureCount > 0
        ? [
            successCount > 0
              ? `I cleaned up ${successCount} ${
                  successCount === 1 ? "sender" : "senders"
                }, but couldn't finish ${failureCount}. You can retry those from Bulk Unsubscribe.`
              : "I couldn't complete that cleanup just now, so I left those senders unchanged. You can retry from Bulk Unsubscribe.",
          ]
        : [];
    await goToDone(
      {
        unsubscribedFromCount: successCount,
        skippedCleanup: false,
      },
      preMessages,
    );
  };

  const onFinish = async () => {
    if (finishing) return;
    setFinishing(true);
    analytics.onNext({
      step: TOTAL_STEPS,
      stepKey: "done",
      totalSteps: TOTAL_STEPS,
    });
    analytics.onComplete({
      step: TOTAL_STEPS,
      stepKey: "done",
      totalSteps: TOTAL_STEPS,
      destination,
    });
    await Promise.all([
      saveAnswersQueueRef.current,
      rulesCreationRef.current ?? Promise.resolve(),
    ]);
    await completeAndRedirect();
    setFinishing(false);
  };

  const onSkip = async () => {
    if (finishing) return;
    setFinishing(true);
    analytics.onSkip({
      stepKey: beat,
      step: beat === "cleanupPending" ? BEAT_STEP.unsubscribe : BEAT_STEP[beat],
      totalSteps: TOTAL_STEPS,
      destination,
    });
    await Promise.all([
      saveAnswersQueueRef.current,
      rulesCreationRef.current ?? Promise.resolve(),
    ]);
    await completeAndRedirect();
    setFinishing(false);
  };

  const artifactMode = getArtifactMode(beat);
  const currentBeatDef = beat === "cleanupPending" ? null : CHAT_BEATS[beat];

  const renderArtifact = (className?: string) => (
    <ChatOnboardingArtifact
      className={className}
      mode={artifactMode}
      updating={typing}
      categories={categories}
      unsubscribe={{
        senders: shownSenders,
        totalCount: suggestions.length,
        deselected,
        onToggle: onToggleSender,
        selectedCount: selectedSenders.length,
        onUnsubscribe: onUnsubscribeSelected,
        submitting: submittingUnsubscribe || isPremiumLoading,
      }}
      summary={doneContext}
    />
  );

  return (
    <div className="flex h-dvh flex-col bg-background">
      <EmailStatsPreloader />

      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <Logo className="h-4 w-auto text-foreground" />
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={onSkip}
          disabled={finishing}
        >
          Skip for now
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-full min-w-0 flex-col lg:w-[420px] lg:shrink-0 lg:border-r">
          <ChatOnboardingChatPane
            messages={messages}
            typing={typing}
            awaiting={awaiting}
            chips={currentBeatDef?.chips}
            placeholder={currentBeatDef?.placeholder}
            onRespond={respond}
            cta={
              beat === "done" && !typing
                ? {
                    label: "Open my inbox",
                    loading: finishing,
                    onClick: onFinish,
                  }
                : null
            }
            inlineArtifact={
              artifactMode !== "idle" ? renderArtifact() : undefined
            }
          />
        </div>

        <div className="hidden min-w-0 flex-1 bg-slate-50 p-4 lg:flex dark:bg-slate-900">
          {renderArtifact("flex-1")}
        </div>
      </div>

      <PremiumModal />
    </div>
  );
}
