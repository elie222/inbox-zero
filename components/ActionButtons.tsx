import { useMemo } from "react";
import {
  ArchiveBoxArrowDownIcon,
  ArrowsPointingOutIcon,
  SparklesIcon,
  TagIcon,
} from "@heroicons/react/24/outline";
import { ButtonGroup } from "@/components/ButtonGroup";
import { LoadingMiniSpinner } from "@/components/Loading";
import { postRequest } from "@/utils/api";
import {
  ArchiveBody,
  ArchiveResponse,
} from "@/app/api/google/threads/archive/route";

export function ActionButtons(props: { threadId: string }) {
  const buttons = useMemo(
    () => [
      {
        tooltip: "Expand",
        onClick: () => {
          // open in gmail
          window.open(
            `https://mail.google.com/mail/u/0/#inbox/${props.threadId}`,
            "_blank"
          );
        },
        icon: (
          <ArrowsPointingOutIcon
            className="h-5 w-5 text-gray-700"
            aria-hidden="true"
          />
        ),
      },
      {
        tooltip: "AI Categorise",
        onClick: () => {},
        icon: <TagIcon className="h-5 w-5 text-gray-700" aria-hidden="true" />,
      },
      {
        tooltip: "Generate AI response",
        onClick: () => {},
        icon: (
          <SparklesIcon className="h-5 w-5 text-gray-700" aria-hidden="true" />
        ),
      },
      {
        tooltip: "Archive",
        onClick: () =>
          // couldn't get server actions to work here
          postRequest<ArchiveResponse, ArchiveBody>(
            "/api/google/threads/archive",
            { id: props.threadId }
          ),
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
    [props.threadId]
  );

  return <ButtonGroup buttons={buttons} />;
}
