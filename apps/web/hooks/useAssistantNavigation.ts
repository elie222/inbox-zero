import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
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
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Only match the main assistant page, not sub-pages like /assistant/create
  const isOnAssistantPage = pathname.endsWith("/assistant");

  const createAssistantUrl = useCallback(
    (params: {
      tab?: string;
      ruleId?: string;
      path: `/${string}`;
      input?: string;
      // [key: string]: string | undefined;
    }) => {
      if (isOnAssistantPage) {
        // If we're on the assistant page, use current search params as base to preserve existing params
        return prefixPath(
          emailAccountId,
          `/assistant${assistantSearchParamsSerializer(searchParams, params)}`,
        );
      } else {
        // If we're not on the assistant page, just use the set path
        return prefixPath(emailAccountId, params.path);
      }
    },
    [emailAccountId, isOnAssistantPage, searchParams],
  );

  return { createAssistantUrl };
}
