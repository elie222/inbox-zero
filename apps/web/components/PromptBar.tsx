import { useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useSWRConfig } from "swr";
import { SparklesIcon } from "@heroicons/react/20/solid";
import { parseJSON } from "@/utils/json";
import { useGmail } from "@/providers/GmailProvider";
import { usePromptContext } from "@/providers/PromptProvider";
import { createFilterFromPromptAction } from "@/utils/actions";

export function PromptBar(props: {}) {
  const { setPrompt, setFunction } = usePromptContext();
  const { labels } = useGmail();

  const inputRef = useRef<HTMLInputElement>(null);
  useHotkeys("meta+k", () => {
    inputRef.current?.focus();
  });

  const { mutate } = useSWRConfig();

  return (
    <form
      className="relative flex flex-1"
      action={async (formData: FormData) => {
        const promptMessage = formData.get("prompt") as string;

        setPrompt(promptMessage);

        const res = await createFilterFromPromptAction({
          message: promptMessage,
          labels: Object.values(labels || {}).map((label) => label.name),
        });

        if (res.filter) {
          setFunction({
            name: res.filter.name || "",
            args: res.filter.arguments ? parseJSON(res.filter.arguments) : {},
          });
        } else {
          console.log("no filter");
          console.log(JSON.stringify(res, null, 2));
        }

        mutate("/api/user/prompt-history");
      }}
    >
      <label htmlFor="prompt-field" className="sr-only">
        Prompt
      </label>
      <SparklesIcon
        className="pointer-events-none absolute inset-y-0 left-0 h-full w-5 text-gray-400"
        aria-hidden="true"
      />
      <input
        id="prompt-field"
        className="block h-full w-full border-0 py-0 pl-8 pr-0 text-gray-900 placeholder:text-gray-400 focus:ring-0 sm:text-sm"
        placeholder="Prompt. eg. Label and archive all newsletters"
        type="text"
        name="prompt"
        autoComplete="off"
        ref={inputRef}
      />
    </form>
  );
}
