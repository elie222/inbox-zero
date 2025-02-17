import { useMemo } from "react";
import { ButtonGroup } from "@/components/ButtonGroup";
import { LoadingMiniSpinner } from "@/components/Loading";
import {
  ArchiveIcon,
  CheckCircleIcon,
  SparklesIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react";

export function ActionButtonsBulk(props: {
  isPlanning: boolean;
  isArchiving: boolean;
  isDeleting: boolean;
  isApproving: boolean;
  isRejecting: boolean;
  onPlanAiAction: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const {
    isPlanning,
    isArchiving,
    isDeleting,
    isApproving,
    isRejecting,
    onPlanAiAction,
    onArchive,
    onDelete,
    onApprove,
    onReject,
  } = props;

  const buttons = useMemo(
    () => [
      {
        tooltip: "Process with assistant",
        onClick: onPlanAiAction,
        icon: isPlanning ? (
          <LoadingMiniSpinner />
        ) : (
          <SparklesIcon className="size-4 text-foreground" aria-hidden="true" />
        ),
      },
      {
        tooltip: "Approve AI Action",
        onClick: onApprove,
        icon: isApproving ? (
          <LoadingMiniSpinner />
        ) : (
          <CheckCircleIcon
            className="size-4 text-foreground"
            aria-hidden="true"
          />
        ),
      },
      {
        tooltip: "Reject AI Action",
        onClick: onReject,
        icon: isRejecting ? (
          <LoadingMiniSpinner />
        ) : (
          <XCircleIcon className="size-4 text-foreground" aria-hidden="true" />
        ),
      },
      {
        tooltip: "Archive",
        onClick: onArchive,
        icon: isArchiving ? (
          <LoadingMiniSpinner />
        ) : (
          <ArchiveIcon className="size-4 text-foreground" aria-hidden="true" />
        ),
      },
      {
        tooltip: "Delete",
        onClick: onDelete,
        icon: isDeleting ? (
          <LoadingMiniSpinner />
        ) : (
          <Trash2Icon className="size-4 text-foreground" aria-hidden="true" />
        ),
      },
    ],
    [
      isArchiving,
      isPlanning,
      isDeleting,
      isApproving,
      isRejecting,
      onArchive,
      onPlanAiAction,
      onDelete,
      onApprove,
      onReject,
    ],
  );

  return <ButtonGroup buttons={buttons} />;
}
