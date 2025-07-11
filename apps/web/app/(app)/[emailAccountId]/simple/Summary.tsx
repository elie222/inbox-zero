"use client";

import { useCompletion } from "@ai-sdk/react";
import { useEffect } from "react";
import { ButtonLoader } from "@/components/Loading";
import { ViewMoreButton } from "@/app/(app)/[emailAccountId]/simple/ViewMoreButton";

export function Summary({
  textHtml,
  textPlain,
  onViewMore,
}: {
  textHtml?: string;
  textPlain?: string;
  onViewMore?: () => void;
}) {
  const { completion, isLoading, complete } = useCompletion({
    api: "/api/ai/summarise",
    body: { textHtml, textPlain },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: textPlain triggers summary update
  useEffect(() => {
    // we send the data via the body instead
    complete("");
  }, [complete, textPlain]);

  return (
    <div className="whitespace-pre-wrap">
      {isLoading && <ButtonLoader />}
      {completion}

      {!!onViewMore && (
        <div className="mt-2">
          <ViewMoreButton onClick={onViewMore} />
        </div>
      )}
    </div>
  );
}
