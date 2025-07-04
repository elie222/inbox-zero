import { useCallback, useState } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { LoadingMiniSpinner } from "@/components/Loading";
import { toastError, toastSuccess } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import type { Executing } from "@/components/email-list/types";
import { cn } from "@/utils";
import { approvePlanAction, rejectPlanAction } from "@/utils/actions/ai-rule";
import { useAccount } from "@/providers/EmailAccountProvider";
import type { Thread } from "@/hooks/useThreads";

export function useExecutePlan(refetch: () => void) {
  const [executingPlan, setExecutingPlan] = useState<Executing>({});
  const [rejectingPlan, setRejectingPlan] = useState<Executing>({});
  const { emailAccountId } = useAccount();

  const executePlan = useCallback(
    async (thread: Thread) => {
      if (!thread.plan?.rule) return;

      setExecutingPlan((s) => ({ ...s, [thread.id!]: true }));

      const lastMessage = thread.messages?.[thread.messages.length - 1];

      const result = await approvePlanAction(emailAccountId, {
        executedRuleId: thread.plan.id,
        message: lastMessage,
      });
      if (result?.serverError) {
        toastError({
          description: `Unable to execute plan. ${result.serverError || ""}`,
        });
      } else {
        toastSuccess({ description: "Executed!" });
      }

      refetch();

      setExecutingPlan((s) => ({ ...s, [thread.id!]: false }));
    },
    [refetch, emailAccountId],
  );

  const rejectPlan = useCallback(
    async (thread: Thread) => {
      setRejectingPlan((s) => ({ ...s, [thread.id!]: true }));

      if (thread.plan?.id) {
        const result = await rejectPlanAction(emailAccountId, {
          executedRuleId: thread.plan.id,
        });
        if (result?.serverError) {
          toastError({
            description: `Error rejecting plan. ${result.serverError || ""}`,
          });
        } else {
          toastSuccess({ description: "Plan rejected" });
        }
      } else {
        toastError({ description: "Plan not found" });
      }

      refetch();

      setRejectingPlan((s) => ({ ...s, [thread.id!]: false }));
    },
    [refetch, emailAccountId],
  );

  return {
    executingPlan,
    rejectingPlan,
    executePlan,
    rejectPlan,
  };
}

export function PlanActions(props: {
  thread: Thread;
  executingPlan: boolean;
  rejectingPlan: boolean;
  executePlan: (thread: Thread) => Promise<void>;
  rejectPlan: (thread: Thread) => Promise<void>;
  className?: string;
}) {
  const { thread, executePlan, rejectPlan } = props;

  const execute = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      executePlan(thread);
    },
    [executePlan, thread],
  );
  const reject = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      rejectPlan(thread);
    },
    [rejectPlan, thread],
  );

  if (!thread.plan?.rule) return null;
  if (thread.plan?.status === "APPLIED" || thread.plan?.status === "REJECTED")
    return null;

  return (
    <div className={cn("flex items-center space-x-1", props.className)}>
      {props.executingPlan ? (
        <LoadingMiniSpinner />
      ) : (
        <Tooltip content="Execute AI Plan">
          <button
            type="button"
            onClick={execute}
            className="rounded-full border border-gray-400 p-1 text-gray-400 hover:border-green-500 hover:text-green-500"
          >
            <CheckIcon className="h-4 w-4" />
          </button>
        </Tooltip>
      )}

      {props.rejectingPlan ? (
        <LoadingMiniSpinner />
      ) : (
        <Tooltip content="Reject AI Plan">
          <button
            type="button"
            onClick={reject}
            className="rounded-full border border-gray-400 p-1 text-gray-400 hover:border-red-500 hover:text-red-500"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </Tooltip>
      )}
    </div>
  );
}
