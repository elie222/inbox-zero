import { useMemo } from "react";
import { ButtonGroup } from "@/components/ButtonGroup";
import { LoadingMiniSpinner } from "@/components/Loading";
import { ArchiveIcon, SparklesIcon, Trash2Icon } from "lucide-react";

export function ActionButtonsBulk(props: {
  isPlanning: boolean;
  isArchiving: boolean;
  isDeleting: boolean;
  onPlanAiAction: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const {
    isPlanning,
    isArchiving,
    isDeleting,
    onPlanAiAction,
    onArchive,
    onDelete,
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
    [isArchiving, isPlanning, isDeleting, onArchive, onPlanAiAction, onDelete],
  );

  return <ButtonGroup buttons={buttons} />;
}
