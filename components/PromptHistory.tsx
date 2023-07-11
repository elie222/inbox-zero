import clsx from "clsx";

type PromptHistoryItem = {
  id: string;
  prompt: string;
  href?: string;
  current?: boolean;
};

type Props = {
  history: PromptHistoryItem[];
};

export function PromptHistoryMobile(props: Props) {
  if (!props.history.length) return null;

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
            </a>
          </li>
        ))}
      </ul>
    </li>
  );
}

export function PromptHistoryDesktop(props: Props) {
  if (!props.history.length) return null;

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
            </a>
          </li>
        ))}
      </ul>
    </li>
  );
}
