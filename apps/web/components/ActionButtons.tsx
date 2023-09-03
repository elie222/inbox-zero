import { useCallback, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  ArchiveBoxArrowDownIcon,
  ArrowTopRightOnSquareIcon,
  ChatBubbleBottomCenterIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { ButtonGroup } from "@/components/ButtonGroup";
import { LoadingMiniSpinner } from "@/components/Loading";
import { postRequest } from "@/utils/api";
import {
  ArchiveBody,
  ArchiveResponse,
} from "@/app/api/google/threads/archive/controller";
import { OrbitIcon } from "lucide-react";

export function ActionButtons(props: {
  threadId: string;
  isPlanning: boolean;
  isCategorizing: boolean;
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
  } = props;

  const openInGmail = useCallback(() => {
    // open in gmail
    const url = `https://mail.google.com/mail/u/${email || 0}/#all/${threadId}`;
    window.open(url, "_blank");
  }, [threadId, email]);

  const [isArchiving, setIsArchiving] = useState(false);

  const archive = useCallback(() => {
    toast.promise(
      async () => {
        setIsArchiving(true);
        await postRequest<ArchiveResponse, ArchiveBody>(
          "/api/google/threads/archive",
          {
            id: threadId,
          }
        );
        onArchive();
        setIsArchiving(false);
      },
      {
        loading: "Archiving...",
        success: "Email archived!",
        error: "Error archiving email",
      }
    );
  }, [threadId, onArchive]);

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
        onClick: archive,
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
      archive,
      isArchiving,
      onPlanAiAction,
      onAiCategorize,
      onReply,
      openInGmail,
      isCategorizing,
      isPlanning,
    ]
  );

  return <ButtonGroup buttons={buttons} />;
}
