"use client";

import { useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  SimpleRichTextEditor,
  type SimpleRichTextEditorRef,
} from "@/components/editor/SimpleRichTextEditor";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { useLabels } from "@/hooks/useLabels";
import { useRules } from "@/hooks/useRules";
import { toastError } from "@/components/Toast";
import { ruleToText } from "@/utils/rule/rule-to-text";
import { MessageText } from "@/components/Typography";

export function RulesPromptFormat() {
  const { data: rules, isLoading: isLoadingRules } = useRules();
  const { userLabels, isLoading: isLoadingLabels } = useLabels();

  const editorRef = useRef<SimpleRichTextEditorRef>(null);

  const rulesText = useMemo(() => {
    if (!rules) return "";

    return rules
      .map((rule, index) => {
        const ruleText = ruleToText(rule);
        return `## Rule ${index + 1}: ${rule.name}\n${rule.enabled ? "" : "(Disabled)\n"}${ruleText}`;
      })
      .join("\n\n---\n\n");
  }, [rules]);

  const onSubmit = useCallback(async () => {
    const markdown = editorRef.current?.getMarkdown();
    if (typeof markdown !== "string") return;
    if (markdown.trim() === "") {
      toastError({
        description: "Please enter a prompt to create rules",
      });
      return;
    }

    // setIsSubmitting(true);
  }, []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <LoadingContent
        loading={isLoadingLabels || isLoadingRules}
        loadingComponent={<Skeleton className="min-h-[220px] w-full" />}
      >
        <SimpleRichTextEditor
          ref={editorRef}
          defaultValue={rulesText}
          minHeight={220}
          userLabels={userLabels}
        />
      </LoadingContent>

      <div className="flex flex-wrap gap-2 mt-4 items-center">
        <Button type="submit" size="sm" disabled>
          Save
        </Button>

        <MessageText className="pl-2">
          Saving in 'Prompt' view is currently disabled. Edit using AI chat or
          'List' view instead.
        </MessageText>
      </div>
    </form>
  );
}
