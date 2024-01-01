import { z } from "zod";

export const composeAutocompleteBody = z.object({
  prompt: z.string(),
});

export type ComposeAutocompleteBody = z.infer<typeof composeAutocompleteBody>;
