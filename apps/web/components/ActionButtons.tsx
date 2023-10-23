import { useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  ArchiveBoxArrowDownIcon,
  ArrowTopRightOnSquareIcon,
  ChatBubbleBottomCenterIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { OrbitIcon } from "lucide-react";
import { ButtonGroup } from "@/components/ButtonGroup";
import { LoadingMiniSpinner } from "@/components/Loading";

export function ActionButtons(props: {
  threadId: string;
  isPlanning: boolean;
  isCategorizing: boolean;
  isArchiving: boolean;
  onPlanAiAction: () => void;
  onAiCategorize: () => void;
  onReply: () => void;
  onArchive: () => void;
}) {
  const session = useSession();
  const email = session.data?.user.email;

  const {
    threadId,
    onArchive,
    onPlanAiAction,
    onAiCategorize,
    onReply,
    isCategorizing,
    isPlanning,
    isArchiving,
  } = props;

  const openInGmail = useCallback(() => {
    // open in gmail
    const url = getGmailUrl(threadId, email);
    window.open(url, "_blank");
  }, [threadId, email]);

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
        onClick: onReply,
        icon: (
          <ChatBubbleBottomCenterIcon
            className="h-5 w-5 text-gray-700"
            aria-hidden="true"
          />
        ),
      },
      {
        tooltip: "AI Categorize",
        onClick: onAiCategorize,
        icon: isCategorizing ? (
          <LoadingMiniSpinner />
        ) : (
          <OrbitIcon className="h-5 w-5 text-gray-700" aria-hidden="true" />
        ),
      },
      {
        tooltip: "Plan AI action",
        onClick: onPlanAiAction,
        icon: isPlanning ? (
          <LoadingMiniSpinner />
        ) : (
          <SparklesIcon className="h-5 w-5 text-gray-700" aria-hidden="true" />
        ),
      },
      {
        tooltip: "Archive",
        onClick: onArchive,
        icon: isArchiving ? (
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
      onArchive,
      isArchiving,
      onPlanAiAction,
      isPlanning,
      onAiCategorize,
      isCategorizing,
      onReply,
      openInGmail,
    ]
  );

  return <ButtonGroup buttons={buttons} />;
}
