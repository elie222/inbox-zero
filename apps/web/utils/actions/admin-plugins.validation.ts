import { z } from "zod";

export const updatePluginAllowlistBody = z.object({
  mode: z.enum(["all", "selected"]),
  allowedPlugins: z.array(z.string()).optional(),
});

export type UpdatePluginAllowlistBody = z.infer<
  typeof updatePluginAllowlistBody
>;
