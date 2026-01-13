import { z } from "zod";

export const installPluginBody = z.object({
  pluginId: z.string().min(1, "Plugin ID is required"),
  repositoryUrl: z.string().url("Invalid repository URL"),
  version: z.string().min(1, "Version is required"),
  versionType: z.enum(["release", "branch"]),
  catalogUrl: z.string().url().optional(),
});
export type InstallPluginBody = z.infer<typeof installPluginBody>;

export const updatePluginBody = z.object({
  pluginId: z.string().min(1, "Plugin ID is required"),
  version: z.string().optional(), // if not provided, update to latest
});
export type UpdatePluginBody = z.infer<typeof updatePluginBody>;

export const uninstallPluginBody = z.object({
  pluginId: z.string().min(1, "Plugin ID is required"),
});
export type UninstallPluginBody = z.infer<typeof uninstallPluginBody>;

export const togglePluginEnabledBody = z.object({
  pluginId: z.string().min(1, "Plugin ID is required"),
  enabled: z.boolean(),
});
export type TogglePluginEnabledBody = z.infer<typeof togglePluginEnabledBody>;

export const updatePluginSettingsBody = z.object({
  pluginId: z.string().min(1, "Plugin ID is required"),
  settings: z.record(z.unknown()),
});
export type UpdatePluginSettingsBody = z.infer<typeof updatePluginSettingsBody>;

export const installPluginFromUrlBody = z.object({
  repositoryUrl: z.string().min(1, "Repository URL is required"),
  // for private repos: optional GitHub token and remember preference
  token: z.string().optional(),
  rememberToken: z.boolean().optional(),
});
export type InstallPluginFromUrlBody = z.infer<typeof installPluginFromUrlBody>;
