"use client";

import { useCompletion } from "ai/react";
import { useEffect } from "react";
import { ButtonLoader } from "@/components/ui/button";

export function Summary({
  textHtml,
  textPlain,
}: {
  textHtml?: string;
  textPlain?: string;
}) {
  const { completion, isLoading, complete } = useCompletion({
    api: "/api/ai/summarise",
    body: { textHtml, textPlain },
  });

  useEffect(() => {
    // we send the data via the body instead
    complete("");
  }, [complete, textPlain]);

  return (
    <div className="whitespace-pre-wrap">
      {isLoading && <ButtonLoader />}
      {completion}
    </div>
  );
}
