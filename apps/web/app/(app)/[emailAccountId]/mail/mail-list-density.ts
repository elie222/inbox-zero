import type { MailListDensityMode } from "@/app/(app)/[emailAccountId]/mail/types";

/** Snippet typography for list rows — compact is one line, expanded is ~5. */
export function getMailListSnippetClassName({
  density,
  variant,
}: {
  density: MailListDensityMode;
  variant: "wide" | "stacked";
}): string {
  if (density === "expanded") {
    return variant === "wide"
      ? "line-clamp-5 text-muted-foreground text-sm"
      : "line-clamp-5 whitespace-normal text-muted-foreground text-xs";
  }

  return variant === "wide"
    ? "min-w-0 flex-1 truncate text-muted-foreground text-sm"
    : "truncate text-muted-foreground text-xs";
}
