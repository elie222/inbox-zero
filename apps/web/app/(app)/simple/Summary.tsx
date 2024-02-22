"use client";

import { useCompletion } from "ai/react";
import { useEffect } from "react";
import { ButtonLoader } from "@/components/ui/button";

export function Summary({ text }: { text: string }) {
  const { completion, isLoading, complete } = useCompletion({
    api: "/api/ai/summarise",
    initialInput: text,
  });

  useEffect(() => {
    complete(text);
  }, [complete, text]);

  return (
    <div className="whitespace-pre-wrap">
      {isLoading && <ButtonLoader />}
      {completion}
    </div>
  );
}
