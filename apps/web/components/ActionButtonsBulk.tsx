import { useMemo } from "react";
import { ButtonGroup } from "@/components/ButtonGroup";
import { LoadingMiniSpinner } from "@/components/Loading";
import { ArchiveIcon, OrbitIcon, SparklesIcon, Trash2Icon } from "lucide-react";

export function ActionButtonsBulk(props: {
  isPlanning: boolean;
  isCategorizing: boolean;
  isArchiving: boolean;
  isDeleting: boolean;
  onPlanAiAction: () => void;
  onAiCategorize: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const {
    isPlanning,
    isCategorizing,
    isArchiving,
    isDeleting,
    onPlanAiAction,
    onAiCategorize,
    onArchive,
    onDelete,
  } = props;

  const buttons = useMemo(
    () => [
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
      onAiCategorize,
      onArchive,
      onPlanAiAction,
      onDelete,
    ],
  );

  return <ButtonGroup buttons={buttons} />;
}
