import useSWR from "swr";
import clsx from "clsx";
import { LoadingContent } from "@/components/LoadingContent";
import { PromptHistoryResponse } from "@/app/api/user/prompt-history/controller";
import { deletePromptHistoryAction } from "@/utils/actions";
import { XMarkIcon } from "@heroicons/react/20/solid";

type PromptHistoryItem = {
  id: string;
  prompt: string;
  href?: string;
  current?: boolean;
};

export function PromptHistory() {
  const { data, isLoading, error, mutate } = useSWR<PromptHistoryResponse>(
    "/api/user/prompt-history"
  );

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && <PromptHistoryInner history={data.history} refetch={mutate} />}
    </LoadingContent>
  );
}

function PromptHistoryInner(props: {
  history: PromptHistoryItem[];
  refetch: () => void;
}) {
  if (!props.history?.length) return null;

  return (
    <li>
      <div className="text-xs font-semibold leading-6 text-gray-400">
        Prompt history
      </div>
      <ul role="list" className="-mx-2 mt-2 space-y-1">
        {props.history.map((prompt) => (
          <li key={prompt.id}>
            <a
              href={prompt.href}
              className={clsx(
                prompt.current
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white",
                "group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6"
              )}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-[0.625rem] font-medium text-gray-400 group-hover:text-white">
                {prompt.prompt[0]?.toUpperCase()}
              </span>
              <span className="truncate">{prompt.prompt.substring(0, 40)}</span>
              <button
                className="ml-auto transform hover:scale-110"
                type="button"
                onClick={async (e) => {
                  e.preventDefault();
                  await deletePromptHistoryAction({ id: prompt.id });
                  props.refetch();
                }}
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </a>
          </li>
        ))}
      </ul>
    </li>
  );
}
