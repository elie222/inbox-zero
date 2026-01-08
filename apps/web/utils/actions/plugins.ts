"use server";

import { actionClientUser } from "@/utils/actions/safe-action";
import {
  installPluginBody,
  updatePluginBody,
  uninstallPluginBody,
  togglePluginEnabledBody,
  updatePluginSettingsBody,
  installPluginFromUrlBody,
} from "@/utils/actions/plugins.validation";
import {
  fetchPluginManifest,
  isValidGitHubUrl,
} from "@/lib/plugin-library/catalog";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import {
  getEffectiveAllowlist,
  isPluginAllowed,
} from "@/lib/plugin-library/allowlist";
import { env } from "@/env";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";

export const installPluginAction = actionClientUser
  .metadata({ name: "installPlugin" })
  .schema(installPluginBody)
  .action(async ({ ctx: { userId, logger }, parsedInput }) => {
    const { pluginId, repositoryUrl, version, versionType, catalogUrl } =
      parsedInput;

    logger.info("Installing plugin", { pluginId, version, versionType });

    // check if plugins feature is enabled
    if (!env.FEATURE_PLUGINS_ENABLED) {
      throw new SafeError("Plugins feature is not enabled");
    }

    // check if user install is enabled
    if (env.PLUGINS_USER_INSTALL_ENABLED === false) {
      throw new SafeError("Plugin installation is disabled for users");
    }

    // get user's organization for allowlist check
    const member = await prisma.member.findFirst({
      where: { emailAccount: { userId } },
      select: { organizationId: true },
    });

    // check allowlist
    const allowlist = await getEffectiveAllowlist(member?.organizationId);
    if (!isPluginAllowed(pluginId, allowlist)) {
      throw new SafeError("Plugin is not in the allowed list");
    }

    // check if plugin is already installed
    const existingPlugin = await prisma.installedPlugin.findUnique({
      where: { pluginId },
    });

    if (existingPlugin) {
      throw new SafeError("Plugin is already installed");
    }

    // create database record
    const plugin = await prisma.installedPlugin.create({
      data: {
        pluginId,
        version,
        versionType,
        repositoryUrl,
        catalogUrl,
        enabled: true,
      },
    });

    // auto-enable for single tenant (single user setup)
    const userCount = await prisma.user.count();
    if (userCount === 1) {
      await prisma.pluginUserSettings.create({
        data: {
          pluginId: plugin.id,
          userId,
          enabled: true,
          settings: {} as Prisma.InputJsonValue,
        },
      });
    }

    logger.info("Plugin installed successfully", {
      pluginId,
      installedPluginId: plugin.id,
    });

    revalidatePath("/plugins");

    return { success: true, plugin };
  });

export const updatePluginAction = actionClientUser
  .metadata({ name: "updatePlugin" })
  .schema(updatePluginBody)
  .action(async ({ ctx: { logger }, parsedInput }) => {
    const { pluginId, version } = parsedInput;

    logger.info("Updating plugin", { pluginId, version });

    // check if plugins feature is enabled
    if (!env.FEATURE_PLUGINS_ENABLED) {
      throw new SafeError("Plugins feature is not enabled");
    }

    // find installed plugin
    const installedPlugin = await prisma.installedPlugin.findUnique({
      where: { pluginId },
    });

    if (!installedPlugin) {
      throw new SafeError("Plugin is not installed");
    }

    // determine target version
    const targetVersion = version ?? installedPlugin.version;

    // update the plugin record
    const updatedPlugin = await prisma.installedPlugin.update({
      where: { pluginId },
      data: {
        version: targetVersion,
        updatedAt: new Date(),
      },
    });

    logger.info("Plugin updated successfully", {
      pluginId,
      version: targetVersion,
    });

    revalidatePath("/plugins");

    return { success: true, plugin: updatedPlugin };
  });

export const uninstallPluginAction = actionClientUser
  .metadata({ name: "uninstallPlugin" })
  .schema(uninstallPluginBody)
  .action(async ({ ctx: { logger }, parsedInput }) => {
    const { pluginId } = parsedInput;

    logger.info("Uninstalling plugin", { pluginId });

    // check if plugins feature is enabled
    if (!env.FEATURE_PLUGINS_ENABLED) {
      throw new SafeError("Plugins feature is not enabled");
    }

    // find installed plugin
    const installedPlugin = await prisma.installedPlugin.findUnique({
      where: { pluginId },
    });

    if (!installedPlugin) {
      throw new SafeError("Plugin is not installed");
    }

    // cascade delete handles user settings and account settings
    await prisma.installedPlugin.delete({
      where: { pluginId },
    });

    logger.info("Plugin uninstalled successfully", { pluginId });

    revalidatePath("/plugins");

    return { success: true };
  });

export const togglePluginEnabledAction = actionClientUser
  .metadata({ name: "togglePluginEnabled" })
  .schema(togglePluginEnabledBody)
  .action(async ({ ctx: { userId, logger }, parsedInput }) => {
    const { pluginId, enabled } = parsedInput;

    logger.info("Toggling plugin enabled state", { pluginId, enabled });

    // check if plugins feature is enabled
    if (!env.FEATURE_PLUGINS_ENABLED) {
      throw new SafeError("Plugins feature is not enabled");
    }

    // find installed plugin
    const installedPlugin = await prisma.installedPlugin.findUnique({
      where: { pluginId },
    });

    if (!installedPlugin) {
      throw new SafeError("Plugin is not installed");
    }

    // upsert user settings for this plugin
    await prisma.pluginUserSettings.upsert({
      where: {
        pluginId_userId: {
          pluginId: installedPlugin.id,
          userId,
        },
      },
      create: {
        pluginId: installedPlugin.id,
        userId,
        enabled,
        settings: {} as Prisma.InputJsonValue,
      },
      update: {
        enabled,
      },
    });

    logger.info("Plugin enabled state updated", { pluginId, enabled });

    revalidatePath("/plugins");

    return { success: true };
  });

export const updatePluginSettingsAction = actionClientUser
  .metadata({ name: "updatePluginSettings" })
  .schema(updatePluginSettingsBody)
  .action(async ({ ctx: { userId, logger }, parsedInput }) => {
    const { pluginId, settings } = parsedInput;

    logger.info("Updating plugin settings", { pluginId });

    // check if plugins feature is enabled
    if (!env.FEATURE_PLUGINS_ENABLED) {
      throw new SafeError("Plugins feature is not enabled");
    }

    // find installed plugin
    const installedPlugin = await prisma.installedPlugin.findUnique({
      where: { pluginId },
    });

    if (!installedPlugin) {
      throw new SafeError("Plugin is not installed");
    }

    // cast settings to Prisma-compatible JSON type
    const jsonSettings = settings as Prisma.InputJsonValue;

    // upsert user settings for this plugin
    const userSettings = await prisma.pluginUserSettings.upsert({
      where: {
        pluginId_userId: {
          pluginId: installedPlugin.id,
          userId,
        },
      },
      create: {
        pluginId: installedPlugin.id,
        userId,
        enabled: true,
        settings: jsonSettings,
      },
      update: {
        settings: jsonSettings,
      },
    });

    logger.info("Plugin settings updated", { pluginId });

    revalidatePath("/plugins");

    return { success: true, settings: userSettings };
  });

export const updateAllPluginsAction = actionClientUser
  .metadata({ name: "updateAllPlugins" })
  .action(async ({ ctx: { logger } }) => {
    logger.info("Updating all plugins");

    // check if plugins feature is enabled
    if (!env.FEATURE_PLUGINS_ENABLED) {
      throw new SafeError("Plugins feature is not enabled");
    }

    // get all installed plugins
    const installedPlugins = await prisma.installedPlugin.findMany({
      where: { enabled: true },
    });

    const results: Array<{
      pluginId: string;
      success: boolean;
      error?: string;
    }> = [];

    for (const plugin of installedPlugins) {
      try {
        // update timestamp to mark as checked
        await prisma.installedPlugin.update({
          where: { id: plugin.id },
          data: { updatedAt: new Date() },
        });

        results.push({ pluginId: plugin.pluginId, success: true });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        results.push({
          pluginId: plugin.pluginId,
          success: false,
          error: errorMessage,
        });
        logger.error("Failed to update plugin", {
          pluginId: plugin.pluginId,
          error: errorMessage,
        });
      }
    }

    logger.info("All plugins update completed", {
      total: installedPlugins.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    });

    revalidatePath("/plugins");

    return { success: true, results };
  });

export const togglePluginGlobalEnabledAction = actionClientUser
  .metadata({ name: "togglePluginGlobalEnabled" })
  .schema(togglePluginEnabledBody)
  .action(async ({ ctx: { logger }, parsedInput }) => {
    const { pluginId, enabled } = parsedInput;

    logger.info("Toggling plugin global enabled state", { pluginId, enabled });

    // check if plugins feature is enabled
    if (!env.FEATURE_PLUGINS_ENABLED) {
      throw new SafeError("Plugins feature is not enabled");
    }

    // find and update installed plugin global state
    const installedPlugin = await prisma.installedPlugin.findUnique({
      where: { pluginId },
    });

    if (!installedPlugin) {
      throw new SafeError("Plugin is not installed");
    }

    await prisma.installedPlugin.update({
      where: { pluginId },
      data: { enabled },
    });

    logger.info("Plugin global enabled state updated", { pluginId, enabled });

    revalidatePath("/plugins");

    return { success: true };
  });

/**
 * Install a plugin directly from a GitHub repository URL.
 * Does not require the plugin to be in any catalog.
 */
export const installPluginFromUrlAction = actionClientUser
  .metadata({ name: "installPluginFromUrl" })
  .schema(installPluginFromUrlBody)
  .action(async ({ ctx: { userId, logger }, parsedInput }) => {
    const { repositoryUrl } = parsedInput;

    logger.info("Installing plugin from URL", { repositoryUrl });

    // check if plugins feature is enabled
    if (!env.FEATURE_PLUGINS_ENABLED) {
      throw new SafeError("Plugins feature is not enabled");
    }

    // check if user install is enabled
    if (env.PLUGINS_USER_INSTALL_ENABLED === false) {
      throw new SafeError("Plugin installation is disabled for users");
    }

    // normalize the URL
    let normalizedUrl = repositoryUrl.trim();
    // ensure https:// prefix
    if (
      !normalizedUrl.startsWith("https://") &&
      !normalizedUrl.startsWith("http://")
    ) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    // upgrade http to https
    if (normalizedUrl.startsWith("http://")) {
      normalizedUrl = normalizedUrl.replace("http://", "https://");
    }
    // remove trailing slash
    if (normalizedUrl.endsWith("/")) {
      normalizedUrl = normalizedUrl.slice(0, -1);
    }
    // remove .git suffix
    if (normalizedUrl.endsWith(".git")) {
      normalizedUrl = normalizedUrl.slice(0, -4);
    }

    // SECURITY: Only allow GitHub URLs
    if (!isValidGitHubUrl(normalizedUrl)) {
      throw new SafeError("Only https://github.com URLs are allowed");
    }

    // fetch plugin.json from the repository
    let manifest: Awaited<ReturnType<typeof fetchPluginManifest>>;
    try {
      manifest = await fetchPluginManifest(normalizedUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to fetch plugin manifest", {
        repositoryUrl: normalizedUrl,
        error: message,
      });
      throw new SafeError(
        `Could not fetch plugin.json from repository: ${message}`,
      );
    }

    const pluginId = manifest.id;

    // get user's organization for allowlist check
    const member = await prisma.member.findFirst({
      where: { emailAccount: { userId } },
      select: { organizationId: true },
    });

    // check allowlist (if one is configured)
    const allowlist = await getEffectiveAllowlist(member?.organizationId);
    if (allowlist && !isPluginAllowed(pluginId, allowlist)) {
      throw new SafeError(
        "Plugin is not in the allowed list for your organization",
      );
    }

    // check if plugin is already installed
    const existingPlugin = await prisma.installedPlugin.findUnique({
      where: { pluginId },
    });

    if (existingPlugin) {
      throw new SafeError("Plugin is already installed");
    }

    // create database record
    const plugin = await prisma.installedPlugin.create({
      data: {
        pluginId,
        version: manifest.version,
        versionType: "release",
        repositoryUrl: normalizedUrl,
        enabled: true,
      },
    });

    // auto-enable for single tenant (single user setup)
    const userCount = await prisma.user.count();
    if (userCount === 1) {
      await prisma.pluginUserSettings.create({
        data: {
          pluginId: plugin.id,
          userId,
          enabled: true,
          settings: {} as Prisma.InputJsonValue,
        },
      });
    }

    logger.info("Plugin installed from URL successfully", {
      pluginId,
      installedPluginId: plugin.id,
      name: manifest.name,
      version: manifest.version,
    });

    revalidatePath("/plugins");

    return {
      success: true,
      plugin,
      name: manifest.name,
      version: manifest.version,
    };
  });
