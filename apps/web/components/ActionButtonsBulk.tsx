import { useMemo } from "react";
import { ButtonGroup } from "@/components/ButtonGroup";
import { LoadingMiniSpinner } from "@/components/Loading";
import {
  ArchiveIcon,
  CheckCircleIcon,
  OrbitIcon,
  SparklesIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react";

export function ActionButtonsBulk(props: {
  isPlanning: boolean;
  isCategorizing: boolean;
  isArchiving: boolean;
  isDeleting: boolean;
  isApproving: boolean;
  isRejecting: boolean;
  onPlanAiAction: () => void;
  onAiCategorize: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const {
    isPlanning,
    isCategorizing,
    isArchiving,
    isDeleting,
    isApproving,
    isRejecting,
    onPlanAiAction,
    onAiCategorize,
    onArchive,
    onDelete,
    onApprove,
    onReject,
  } = props;

  const buttons = useMemo(
    () => [
      {
        tooltip: "Run AI Rules",
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
        tooltip: "AI Categorize",
        onClick: onAiCategorize,
        icon: isCategorizing ? (
          <LoadingMiniSpinner />
        ) : (
          <OrbitIcon className="size-4 text-foreground" aria-hidden="true" />
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
      isCategorizing,
      isPlanning,
      isDeleting,
      isApproving,
      isRejecting,
      onAiCategorize,
      onArchive,
      onPlanAiAction,
      onDelete,
      onApprove,
      onReject,
    ],
  );

  return <ButtonGroup buttons={buttons} />;
}
