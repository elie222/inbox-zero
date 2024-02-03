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
        tooltip: "Plan AI action",
        onClick: onPlanAiAction,
        icon: isPlanning ? (
          <LoadingMiniSpinner />
        ) : (
          <SparklesIcon className="h-5 w-5 text-gray-700" aria-hidden="true" />
        ),
      },
      {
        tooltip: "Approve AI Action",
        onClick: onApprove,
        icon: isApproving ? (
          <LoadingMiniSpinner />
        ) : (
          <CheckCircleIcon
            className="h-5 w-5 text-gray-700"
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
          <XCircleIcon className="h-5 w-5 text-gray-700" aria-hidden="true" />
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
        tooltip: "Archive",
        onClick: onArchive,
        icon: isArchiving ? (
          <LoadingMiniSpinner />
        ) : (
          <ArchiveIcon className="h-5 w-5 text-gray-700" aria-hidden="true" />
        ),
      },
      {
        tooltip: "Delete",
        onClick: onDelete,
        icon: isDeleting ? (
          <LoadingMiniSpinner />
        ) : (
          <Trash2Icon className="h-5 w-5 text-gray-700" aria-hidden="true" />
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
