import { useMemo } from "react";
import {
  ArchiveBoxArrowDownIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { ButtonGroup } from "@/components/ButtonGroup";
import { LoadingMiniSpinner } from "@/components/Loading";
import { OrbitIcon } from "lucide-react";

export function ActionButtonsBulk(props: {
  isPlanning: boolean;
  isCategorizing: boolean;
  isArchiving: boolean;
  onPlanAiAction: () => void;
  onAiCategorize: () => void;
  onArchive: () => void;
}) {
  const {
    isPlanning,
    isCategorizing,
    isArchiving,
    onPlanAiAction,
    onAiCategorize,
    onArchive,
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
          <ArchiveBoxArrowDownIcon
            className="h-5 w-5 text-gray-700"
            aria-hidden="true"
          />
        ),
      },
    ],
    [
      isArchiving,
      isCategorizing,
      isPlanning,
      onAiCategorize,
      onArchive,
      onPlanAiAction,
    ]
  );

  return <ButtonGroup buttons={buttons} />;
}
