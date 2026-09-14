import { z } from "zod";
import {
  isValidSnippetShortcut,
  normalizeSnippetShortcut,
} from "@/utils/snippets/snippet-shortcut";

const snippetShortcutSchema = z
  .string()
  .trim()
  .transform(normalizeSnippetShortcut)
  .refine(isValidSnippetShortcut, {
    message:
      "Start with a letter. Use lowercase letters, numbers, and hyphens.",
  });

export const createSnippetBody = z.object({
  content: z.string().trim().min(1, "Content is required").max(10_000),
  name: z.string().trim().min(1, "Name is required").max(80),
  shortcut: snippetShortcutSchema,
});
export type CreateSnippetBody = z.infer<typeof createSnippetBody>;

export const updateSnippetBody = z.object({
  content: z.string().trim().min(1, "Content is required").max(10_000),
  id: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(80),
  shortcut: snippetShortcutSchema,
});
export type UpdateSnippetBody = z.infer<typeof updateSnippetBody>;

export const deleteSnippetBody = z.object({
  id: z.string().min(1),
});
export type DeleteSnippetBody = z.infer<typeof deleteSnippetBody>;
