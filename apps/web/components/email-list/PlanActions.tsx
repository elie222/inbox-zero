import { CheckIcon, XIcon } from "lucide-react";
import { LoadingMiniSpinner } from "@/components/Loading";
import { type Executing, type Thread } from "@/components/email-list/types";
import { useCallback, useState } from "react";
import { postRequest } from "@/utils/api";
import {
  ExecutePlanBody,
  ExecutePlanResponse,
} from "@/app/api/user/planned/[id]/controller";
import { toastError, toastSuccess } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import {
  RejectPlanBody,
  RejectPlanResponse,
} from "@/app/api/user/planned/reject/route";
import { cn } from "@/utils";

export function useExecutePlan(refetch: () => void) {
  const [executingPlan, setExecutingPlan] = useState<Executing>({});
  const [rejectingPlan, setRejectingPlan] = useState<Executing>({});

  const executePlan = useCallback(
    async (thread: Thread) => {
      if (!thread.plan?.rule) return;

      setExecutingPlan((s) => ({ ...s, [thread.id!]: true }));

      const lastMessage = thread.messages?.[thread.messages.length - 1];

      try {
        await postRequest<ExecutePlanResponse, ExecutePlanBody>(
          `/api/user/planned/${thread.plan.id}`,
          {
            email: {
              subject: lastMessage.parsedMessage.headers.subject,
              from: lastMessage.parsedMessage.headers.from,
              to: lastMessage.parsedMessage.headers.to,
              cc: lastMessage.parsedMessage.headers.cc,
              replyTo: lastMessage.parsedMessage.headers["reply-to"],
              references: lastMessage.parsedMessage.headers["references"],
              date: lastMessage.parsedMessage.headers.date,
              headerMessageId: lastMessage.parsedMessage.headers["message-id"],
              textPlain: lastMessage.parsedMessage.textPlain || null,
              textHtml: lastMessage.parsedMessage.textHtml || null,
              snippet: lastMessage.snippet || null,
              messageId: lastMessage.id || "",
              threadId: lastMessage.threadId || "",
            },
            ruleId: thread.plan.rule.id,
            actions: thread.plan.rule.actions,
            args: thread.plan.functionArgs,
          },
        );

        toastSuccess({ description: "Executed!" });
      } catch (error) {
        console.error(error);
        toastError({
          description: "Unable to execute plan :(",
        });
      }

      refetch();

      setExecutingPlan((s) => ({ ...s, [thread.id!]: false }));
    },
    [refetch],
  );

  const rejectPlan = useCallback(
    async (thread: Thread) => {
      setRejectingPlan((s) => ({ ...s, [thread.id!]: true }));

      try {
        await postRequest<RejectPlanResponse, RejectPlanBody>(
          `/api/user/planned/reject`,
          { threadId: thread.id! },
        );

        toastSuccess({ description: "Plan rejected" });
      } catch (error) {
        console.error(error);
        toastError({
          description: "Unable to reject plan :(",
        });
      }

      refetch();

      setRejectingPlan((s) => ({ ...s, [thread.id!]: false }));
    },
    [refetch],
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

  const execute = useCallback(async () => {
    executePlan(thread);
  }, [executePlan, thread]);
  const reject = useCallback(async () => {
    rejectPlan(thread);
  }, [rejectPlan, thread]);

  if (!thread.plan?.rule) return null;

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
