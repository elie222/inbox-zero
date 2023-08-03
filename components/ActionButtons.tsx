import { useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  ArchiveBoxArrowDownIcon,
  ArrowTopRightOnSquareIcon,
  ChatBubbleBottomCenterIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { Orbit } from "lucide-react";
import { ButtonGroup } from "@/components/ButtonGroup";
import { LoadingMiniSpinner } from "@/components/Loading";
import { postRequest } from "@/utils/api";
import {
  ArchiveBody,
  ArchiveResponse,
} from "@/app/api/google/threads/archive/controller";

export function ActionButtons(props: {
  threadId: string;
  onGenerateAiResponse: () => void;
  isPlanning: boolean;
  onPlanAiAction: () => void;
  onReply: () => void;
}) {
  const session = useSession();
  const email = session.data?.user.email;

  const openInGmail = useCallback(() => {
    // open in gmail
    const url = `https://mail.google.com/mail/u/${email || 0}/#all/${
      props.threadId
    }`;
    window.open(url, "_blank");
  }, [props.threadId, email]);

  const archive = useCallback(() => {
    // couldn't get server actions to work here
    postRequest<ArchiveResponse, ArchiveBody>("/api/google/threads/archive", {
      id: props.threadId,
    });
  }, [props.threadId]);

  const buttons = useMemo(
    () => [
      {
        tooltip: "Open in Gmail",
        onClick: openInGmail,
        icon: (
          <ArrowTopRightOnSquareIcon
            className="h-5 w-5 text-gray-700"
            aria-hidden="true"
          />
        ),
      },
      {
        tooltip: "Reply",
        onClick: props.onReply,
        icon: (
          <ChatBubbleBottomCenterIcon
            className="h-5 w-5 text-gray-700"
            aria-hidden="true"
          />
        ),
      },
      {
        tooltip: "Generate AI response",
        onClick: props.onGenerateAiResponse,
        icon: (
          <SparklesIcon className="h-5 w-5 text-gray-700" aria-hidden="true" />
        ),
      },
      {
        tooltip: "Plan AI action",
        onClick: props.onPlanAiAction,
        icon: props.isPlanning ? (
          <LoadingMiniSpinner />
        ) : (
          <Orbit className="h-5 w-5 text-gray-700" aria-hidden="true" />
        ),
      },
      {
        tooltip: "Archive",
        onClick: archive,
        icon: false ? (
          <LoadingMiniSpinner />
        ) : (
          <ArchiveBoxArrowDownIcon
            className="h-5 w-5 text-gray-700"
            aria-hidden="true"
          />
        ),
      },
    ],
    [
      openInGmail,
      props.onReply,
      props.onGenerateAiResponse,
      props.onPlanAiAction,
      props.isPlanning,
      archive,
    ]
  );

  return <ButtonGroup buttons={buttons} />;
}
