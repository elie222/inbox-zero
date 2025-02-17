import { useCallback, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  ArchiveIcon,
  Trash2Icon,
  ExternalLinkIcon,
  SparklesIcon,
} from "lucide-react";
import { ButtonGroup } from "@/components/ButtonGroup";
import { LoadingMiniSpinner } from "@/components/Loading";
import { getGmailUrl } from "@/utils/url";
import { onTrashThread } from "@/utils/actions/client";

export function ActionButtons({
  threadId,
  onArchive,
  onPlanAiAction,
  isPlanning,
  refetch,
  shadow,
}: {
  threadId: string;
  isPlanning: boolean;
  shadow?: boolean;
  onPlanAiAction: () => void;
  onArchive: () => void;
  refetch: (threadId?: string) => void;
}) {
  const session = useSession();
  const email = session.data?.user.email;

  const openInGmail = useCallback(() => {
    // open in gmail
    const url = getGmailUrl(threadId, email);
    window.open(url, "_blank");
  }, [threadId, email]);

  const [isTrashing, setIsTrashing] = useState(false);

  // TODO lift this up to the parent component to be consistent / to support bulk trash
  // TODO show loading toast
  const onTrash = useCallback(async () => {
    setIsTrashing(true);
    await onTrashThread(threadId);
    refetch(threadId);
    setIsTrashing(false);
  }, [threadId, refetch]);

  const buttons = useMemo(
    () => [
      {
        tooltip: "Open in Gmail",
        onClick: openInGmail,
        icon: <ExternalLinkIcon className="size-4" aria-hidden="true" />,
      },
      {
        tooltip: "Process with assistant",
        onClick: onPlanAiAction,
        icon: isPlanning ? (
          <LoadingMiniSpinner />
        ) : (
          <SparklesIcon className="size-4" aria-hidden="true" />
        ),
      },
      {
        tooltip: "Archive",
        onClick: onArchive,
        icon: <ArchiveIcon className="size-4" aria-hidden="true" />,
      },
      // may remove later
      {
        tooltip: "Delete",
        onClick: onTrash,
        icon: isTrashing ? (
          <LoadingMiniSpinner />
        ) : (
          <Trash2Icon className="size-4" aria-hidden="true" />
        ),
      },
    ],
    [onTrash, isTrashing, onArchive, onPlanAiAction, isPlanning, openInGmail],
  );

  return <ButtonGroup buttons={buttons} shadow={shadow} />;
}
