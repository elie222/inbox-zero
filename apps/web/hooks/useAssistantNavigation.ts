import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createSerializer, parseAsString } from "nuqs";
import { prefixPath } from "@/utils/path";

const assistantSearchParamsSerializer = createSerializer({
  tab: parseAsString,
  ruleId: parseAsString,
  chatId: parseAsString,
  mode: parseAsString,
  page: parseAsString,
  search: parseAsString,
  custom: parseAsString,
  input: parseAsString,
});

export function useAssistantNavigation(emailAccountId: string) {
  const searchParams = useSearchParams();

  const createAssistantUrl = useCallback(
    (params: {
      tab?: string;
      ruleId?: string;
      path: `/${string}`;
      input?: string;
    }) => {
      return prefixPath(
        emailAccountId,
        `/assistant${assistantSearchParamsSerializer(searchParams, params)}`,
      );
    },
    [emailAccountId, searchParams],
  );

  return { createAssistantUrl };
}
