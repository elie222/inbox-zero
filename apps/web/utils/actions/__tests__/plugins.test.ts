/**
 * Tests for plugin server actions.
 *
 * These actions handle plugin installation, updates, uninstallation,
 * and settings management with proper authorization and feature gating.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoist mock variables so they're available during vi.mock hoisting
const { mockEnv, mockAllowlistFns, mockCatalogFns, mockRevalidatePath } =
  vi.hoisted(() => ({
    mockEnv: {
      FEATURE_PLUGINS_ENABLED: true,
      PLUGINS_USER_INSTALL_ENABLED: true,
      PLUGINS_ALLOWED_LIST: undefined as string | undefined,
      NODE_ENV: "test",
    },
    mockAllowlistFns: {
      getEffectiveAllowlist: vi.fn(async () => ({
        allowed: null as string[] | null,
        mode: "open" as "open" | "curated" | "admin-only",
      })),
      isPluginAllowed: vi.fn(() => true),
    },
    mockCatalogFns: {
      fetchPluginManifest: vi.fn(async () => ({
        id: "test-plugin",
        name: "Test Plugin",
        version: "1.0.0",
        entry: "index.ts",
        capabilities: ["email:classify"],
      })),
      isValidGitHubUrl: vi.fn(() => true),
    },
    mockRevalidatePath: vi.fn(),
  }));

// Mock server-only before importing actions
vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-123", email: "test@example.com" },
  })),
}));

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/env", () => ({
  env: mockEnv,
}));

vi.mock("@/lib/plugin-library/allowlist", () => mockAllowlistFns);

vi.mock("@/lib/plugin-library/catalog", () => mockCatalogFns);

import prisma from "@/utils/__mocks__/prisma";

import {
  installPluginAction,
  updatePluginAction,
  uninstallPluginAction,
  togglePluginEnabledAction,
  updatePluginSettingsAction,
  updateAllPluginsAction,
  togglePluginGlobalEnabledAction,
  installPluginFromUrlAction,
} from "@/utils/actions/plugins";

// Re-export hoisted mocks for use in tests
const { getEffectiveAllowlist, isPluginAllowed } = mockAllowlistFns;
const { fetchPluginManifest, isValidGitHubUrl } = mockCatalogFns;

describe("Plugin Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRevalidatePath.mockClear();
    // Reset env to defaults
    mockEnv.FEATURE_PLUGINS_ENABLED = true;
    mockEnv.PLUGINS_USER_INSTALL_ENABLED = true;
    mockEnv.PLUGINS_ALLOWED_LIST = undefined;
    // Reset allowlist mock
    getEffectiveAllowlist.mockResolvedValue({ allowed: null, mode: "open" });
    isPluginAllowed.mockReturnValue(true);
  });

  describe("installPluginAction", () => {
    const validInput = {
      pluginId: "test-plugin",
      repositoryUrl: "https://github.com/test/test-plugin",
      version: "1.0.0",
      versionType: "release" as const,
    };

    it("throws error when plugins feature is disabled", async () => {
      mockEnv.FEATURE_PLUGINS_ENABLED = false;

      const result = await installPluginAction(validInput);

      expect(result?.serverError).toBe("Plugins feature is not enabled");
    });

    it("throws error when user install is disabled", async () => {
      mockEnv.PLUGINS_USER_INSTALL_ENABLED = false;

      const result = await installPluginAction(validInput);

      expect(result?.serverError).toBe(
        "Plugin installation is disabled for users",
      );
    });

    it("throws error when plugin is not in allowlist", async () => {
      isPluginAllowed.mockReturnValue(false);

      const result = await installPluginAction(validInput);

      expect(result?.serverError).toBe("Plugin is not in the allowed list");
    });

    it("throws error when plugin is already installed", async () => {
      prisma.installedPlugin.findUnique.mockResolvedValueOnce({
        id: "existing-id",
        pluginId: "test-plugin",
      } as any);

      const result = await installPluginAction(validInput);

      expect(result?.serverError).toBe("Plugin is already installed");
    });

    it("installs plugin successfully", async () => {
      prisma.member.findFirst.mockResolvedValueOnce(null);
      prisma.installedPlugin.findUnique.mockResolvedValueOnce(null);
      prisma.installedPlugin.create.mockResolvedValueOnce({
        id: "new-plugin-id",
        pluginId: "test-plugin",
        version: "1.0.0",
        versionType: "release",
        enabled: true,
      } as any);
      prisma.user.count.mockResolvedValueOnce(2); // multi-tenant

      const result = await installPluginAction(validInput);

      expect(result?.data?.success).toBe(true);
      expect(result?.data?.plugin.pluginId).toBe("test-plugin");
      expect(prisma.installedPlugin.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          pluginId: "test-plugin",
          version: "1.0.0",
          versionType: "release",
          enabled: true,
        }),
      });
      expect(mockRevalidatePath).toHaveBeenCalledWith("/plugins");
    });

    it("auto-enables plugin for single tenant", async () => {
      prisma.member.findFirst.mockResolvedValueOnce(null);
      prisma.installedPlugin.findUnique.mockResolvedValueOnce(null);
      prisma.installedPlugin.create.mockResolvedValueOnce({
        id: "new-plugin-id",
        pluginId: "test-plugin",
      } as any);
      prisma.user.count.mockResolvedValueOnce(1); // single tenant

      await installPluginAction(validInput);

      expect(prisma.pluginUserSettings.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          pluginId: "new-plugin-id",
          userId: "user-123",
          enabled: true,
        }),
      });
    });

    it("checks organization allowlist", async () => {
      prisma.member.findFirst.mockResolvedValueOnce({
        organizationId: "org-123",
      } as any);
      prisma.installedPlugin.findUnique.mockResolvedValueOnce(null);
      prisma.installedPlugin.create.mockResolvedValueOnce({
        id: "new-plugin-id",
        pluginId: "test-plugin",
      } as any);
      prisma.user.count.mockResolvedValueOnce(2);

      await installPluginAction(validInput);

      expect(getEffectiveAllowlist).toHaveBeenCalledWith("org-123");
    });
  });

  describe("updatePluginAction", () => {
    it("throws error when plugins feature is disabled", async () => {
      mockEnv.FEATURE_PLUGINS_ENABLED = false;

      const result = await updatePluginAction({
        pluginId: "test-plugin",
        version: "2.0.0",
      });

      expect(result?.serverError).toBe("Plugins feature is not enabled");
    });

    it("throws error when plugin is not installed", async () => {
      prisma.installedPlugin.findUnique.mockResolvedValueOnce(null);

      const result = await updatePluginAction({
        pluginId: "test-plugin",
        version: "2.0.0",
      });

      expect(result?.serverError).toBe("Plugin is not installed");
    });

    it("updates plugin version successfully", async () => {
      prisma.installedPlugin.findUnique.mockResolvedValueOnce({
        id: "plugin-id",
        pluginId: "test-plugin",
        version: "1.0.0",
      } as any);
      prisma.installedPlugin.update.mockResolvedValueOnce({
        id: "plugin-id",
        pluginId: "test-plugin",
        version: "2.0.0",
      } as any);

      const result = await updatePluginAction({
        pluginId: "test-plugin",
        version: "2.0.0",
      });

      expect(result?.data?.success).toBe(true);
      expect(result?.data?.plugin.version).toBe("2.0.0");
      expect(mockRevalidatePath).toHaveBeenCalledWith("/plugins");
    });

    it("uses existing version when no version provided", async () => {
      prisma.installedPlugin.findUnique.mockResolvedValueOnce({
        id: "plugin-id",
        pluginId: "test-plugin",
        version: "1.0.0",
      } as any);
      prisma.installedPlugin.update.mockResolvedValueOnce({
        id: "plugin-id",
        pluginId: "test-plugin",
        version: "1.0.0",
      } as any);

      const _result = await updatePluginAction({
        pluginId: "test-plugin",
      });

      expect(prisma.installedPlugin.update).toHaveBeenCalledWith({
        where: { pluginId: "test-plugin" },
        data: expect.objectContaining({
          version: "1.0.0",
        }),
      });
    });
  });

  describe("uninstallPluginAction", () => {
    it("throws error when plugins feature is disabled", async () => {
      mockEnv.FEATURE_PLUGINS_ENABLED = false;

      const result = await uninstallPluginAction({
        pluginId: "test-plugin",
      });

      expect(result?.serverError).toBe("Plugins feature is not enabled");
    });

    it("throws error when plugin is not installed", async () => {
      prisma.installedPlugin.findUnique.mockResolvedValueOnce(null);

      const result = await uninstallPluginAction({
        pluginId: "test-plugin",
      });

      expect(result?.serverError).toBe("Plugin is not installed");
    });

    it("uninstalls plugin successfully", async () => {
      prisma.installedPlugin.findUnique.mockResolvedValueOnce({
        id: "plugin-id",
        pluginId: "test-plugin",
      } as any);

      const result = await uninstallPluginAction({
        pluginId: "test-plugin",
      });

      expect(result?.data?.success).toBe(true);
      expect(prisma.installedPlugin.delete).toHaveBeenCalledWith({
        where: { pluginId: "test-plugin" },
      });
      expect(mockRevalidatePath).toHaveBeenCalledWith("/plugins");
    });

    it("cascade deletes PluginUserSettings via Prisma relation", async () => {
      // Note: Cascade deletion is handled by Prisma schema relations.
      // This test documents the expected behavior: when an InstalledPlugin
      // is deleted, all associated PluginUserSettings are also deleted
      // due to the onDelete: Cascade relation in the Prisma schema.
      prisma.installedPlugin.findUnique.mockResolvedValueOnce({
        id: "plugin-id",
        pluginId: "test-plugin",
      } as any);

      const result = await uninstallPluginAction({
        pluginId: "test-plugin",
      });

      expect(result?.data?.success).toBe(true);
      // Cascade delete is handled by Prisma - no explicit delete call for settings
      expect(prisma.installedPlugin.delete).toHaveBeenCalledWith({
        where: { pluginId: "test-plugin" },
      });
    });
  });

  describe("togglePluginEnabledAction", () => {
    it("throws error when plugins feature is disabled", async () => {
      mockEnv.FEATURE_PLUGINS_ENABLED = false;

      const result = await togglePluginEnabledAction({
        pluginId: "test-plugin",
        enabled: true,
      });

      expect(result?.serverError).toBe("Plugins feature is not enabled");
    });

    it("throws error when plugin is not installed", async () => {
      prisma.installedPlugin.findUnique.mockResolvedValueOnce(null);

      const result = await togglePluginEnabledAction({
        pluginId: "test-plugin",
        enabled: true,
      });

      expect(result?.serverError).toBe("Plugin is not installed");
    });

    it("enables plugin for user", async () => {
      prisma.installedPlugin.findUnique.mockResolvedValueOnce({
        id: "plugin-db-id",
        pluginId: "test-plugin",
      } as any);

      const result = await togglePluginEnabledAction({
        pluginId: "test-plugin",
        enabled: true,
      });

      expect(result?.data?.success).toBe(true);
      expect(prisma.pluginUserSettings.upsert).toHaveBeenCalledWith({
        where: {
          pluginId_userId: {
            pluginId: "plugin-db-id",
            userId: "user-123",
          },
        },
        create: expect.objectContaining({
          pluginId: "plugin-db-id",
          userId: "user-123",
          enabled: true,
        }),
        update: { enabled: true },
      });
      expect(mockRevalidatePath).toHaveBeenCalledWith("/plugins");
    });

    it("disables plugin for user", async () => {
      prisma.installedPlugin.findUnique.mockResolvedValueOnce({
        id: "plugin-db-id",
        pluginId: "test-plugin",
      } as any);

      const result = await togglePluginEnabledAction({
        pluginId: "test-plugin",
        enabled: false,
      });

      expect(result?.data?.success).toBe(true);
      expect(prisma.pluginUserSettings.upsert).toHaveBeenCalledWith({
        where: {
          pluginId_userId: {
            pluginId: "plugin-db-id",
            userId: "user-123",
          },
        },
        create: expect.objectContaining({
          enabled: false,
        }),
        update: { enabled: false },
      });
    });
  });

  describe("updatePluginSettingsAction", () => {
    it("throws error when plugins feature is disabled", async () => {
      mockEnv.FEATURE_PLUGINS_ENABLED = false;

      const result = await updatePluginSettingsAction({
        pluginId: "test-plugin",
        settings: { key: "value" },
      });

      expect(result?.serverError).toBe("Plugins feature is not enabled");
    });

    it("throws error when plugin is not installed", async () => {
      prisma.installedPlugin.findUnique.mockResolvedValueOnce(null);

      const result = await updatePluginSettingsAction({
        pluginId: "test-plugin",
        settings: { key: "value" },
      });

      expect(result?.serverError).toBe("Plugin is not installed");
    });

    it("updates plugin settings", async () => {
      prisma.installedPlugin.findUnique.mockResolvedValueOnce({
        id: "plugin-db-id",
        pluginId: "test-plugin",
      } as any);
      prisma.pluginUserSettings.upsert.mockResolvedValueOnce({
        id: "settings-id",
        settings: { key: "value" },
      } as any);

      const result = await updatePluginSettingsAction({
        pluginId: "test-plugin",
        settings: { key: "value" },
      });

      expect(result?.data?.success).toBe(true);
      expect(prisma.pluginUserSettings.upsert).toHaveBeenCalledWith({
        where: {
          pluginId_userId: {
            pluginId: "plugin-db-id",
            userId: "user-123",
          },
        },
        create: expect.objectContaining({
          settings: { key: "value" },
        }),
        update: {
          settings: { key: "value" },
        },
      });
      expect(mockRevalidatePath).toHaveBeenCalledWith("/plugins");
    });
  });

  describe("updateAllPluginsAction", () => {
    it("throws error when plugins feature is disabled", async () => {
      mockEnv.FEATURE_PLUGINS_ENABLED = false;

      const result = await updateAllPluginsAction();

      expect(result?.serverError).toBe("Plugins feature is not enabled");
    });

    it("updates all enabled plugins", async () => {
      prisma.installedPlugin.findMany.mockResolvedValueOnce([
        { id: "plugin-1", pluginId: "test-plugin-1" },
        { id: "plugin-2", pluginId: "test-plugin-2" },
      ] as any);

      const result = await updateAllPluginsAction();

      expect(result?.data?.success).toBe(true);
      expect(result?.data?.results).toHaveLength(2);
      expect(prisma.installedPlugin.update).toHaveBeenCalledTimes(2);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/plugins");
    });

    it("handles update failures gracefully", async () => {
      prisma.installedPlugin.findMany.mockResolvedValueOnce([
        { id: "plugin-1", pluginId: "test-plugin-1" },
        { id: "plugin-2", pluginId: "test-plugin-2" },
      ] as any);
      prisma.installedPlugin.update
        .mockResolvedValueOnce({} as any)
        .mockRejectedValueOnce(new Error("Update failed"));

      const result = await updateAllPluginsAction();

      expect(result?.data?.success).toBe(true);
      expect(result?.data?.results).toHaveLength(2);
      expect(result?.data?.results[0].success).toBe(true);
      expect(result?.data?.results[1].success).toBe(false);
      expect(result?.data?.results[1].error).toBe("Update failed");
    });
  });

  describe("togglePluginGlobalEnabledAction", () => {
    it("throws error when plugins feature is disabled", async () => {
      mockEnv.FEATURE_PLUGINS_ENABLED = false;

      const result = await togglePluginGlobalEnabledAction({
        pluginId: "test-plugin",
        enabled: true,
      });

      expect(result?.serverError).toBe("Plugins feature is not enabled");
    });

    it("throws error when plugin is not installed", async () => {
      prisma.installedPlugin.findUnique.mockResolvedValueOnce(null);

      const result = await togglePluginGlobalEnabledAction({
        pluginId: "test-plugin",
        enabled: true,
      });

      expect(result?.serverError).toBe("Plugin is not installed");
    });

    it("updates global enabled state", async () => {
      prisma.installedPlugin.findUnique.mockResolvedValueOnce({
        id: "plugin-db-id",
        pluginId: "test-plugin",
      } as any);

      const result = await togglePluginGlobalEnabledAction({
        pluginId: "test-plugin",
        enabled: false,
      });

      expect(result?.data?.success).toBe(true);
      expect(prisma.installedPlugin.update).toHaveBeenCalledWith({
        where: { pluginId: "test-plugin" },
        data: { enabled: false },
      });
      expect(mockRevalidatePath).toHaveBeenCalledWith("/plugins");
    });
  });

  describe("installPluginFromUrlAction", () => {
    const validInput = {
      repositoryUrl: "https://github.com/test/test-plugin",
    };

    it("throws error when plugins feature is disabled", async () => {
      mockEnv.FEATURE_PLUGINS_ENABLED = false;

      const result = await installPluginFromUrlAction(validInput);

      expect(result?.serverError).toBe("Plugins feature is not enabled");
    });

    it("throws error when user install is disabled", async () => {
      mockEnv.PLUGINS_USER_INSTALL_ENABLED = false;

      const result = await installPluginFromUrlAction(validInput);

      expect(result?.serverError).toBe(
        "Plugin installation is disabled for users",
      );
    });

    it("throws error for non-GitHub URLs", async () => {
      isValidGitHubUrl.mockReturnValueOnce(false);

      const result = await installPluginFromUrlAction({
        repositoryUrl: "https://gitlab.com/test/plugin",
      });

      expect(result?.serverError).toBe(
        "Only https://github.com URLs are allowed",
      );
    });

    it("throws error when manifest fetch fails", async () => {
      fetchPluginManifest.mockRejectedValueOnce(new Error("Not found"));

      const result = await installPluginFromUrlAction(validInput);

      expect(result?.serverError).toBe(
        "Could not fetch plugin.json from repository: Not found",
      );
    });

    it("throws error when plugin not in allowlist", async () => {
      getEffectiveAllowlist.mockResolvedValueOnce({
        allowed: ["other-plugin"],
        mode: "curated",
      });
      isPluginAllowed.mockReturnValueOnce(false);

      const result = await installPluginFromUrlAction(validInput);

      expect(result?.serverError).toBe(
        "Plugin is not in the allowed list for your organization",
      );
    });

    it("throws error when plugin is already installed", async () => {
      prisma.member.findFirst.mockResolvedValueOnce(null);
      prisma.installedPlugin.findUnique.mockResolvedValueOnce({
        id: "existing-id",
        pluginId: "test-plugin",
      } as any);

      const result = await installPluginFromUrlAction(validInput);

      expect(result?.serverError).toBe("Plugin is already installed");
    });

    it("installs plugin from URL successfully", async () => {
      prisma.member.findFirst.mockResolvedValueOnce(null);
      prisma.installedPlugin.findUnique.mockResolvedValueOnce(null);
      prisma.installedPlugin.create.mockResolvedValueOnce({
        id: "new-plugin-id",
        pluginId: "test-plugin",
        version: "1.0.0",
      } as any);
      prisma.user.count.mockResolvedValueOnce(2);

      const result = await installPluginFromUrlAction(validInput);

      expect(result?.data?.success).toBe(true);
      expect(result?.data?.name).toBe("Test Plugin");
      expect(result?.data?.version).toBe("1.0.0");
      expect(prisma.installedPlugin.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          pluginId: "test-plugin",
          version: "1.0.0",
          versionType: "release",
          repositoryUrl: "https://github.com/test/test-plugin",
        }),
      });
      expect(mockRevalidatePath).toHaveBeenCalledWith("/plugins");
    });

    it("normalizes URL variations", async () => {
      prisma.member.findFirst.mockResolvedValueOnce(null);
      prisma.installedPlugin.findUnique.mockResolvedValueOnce(null);
      prisma.installedPlugin.create.mockResolvedValueOnce({
        id: "new-plugin-id",
        pluginId: "test-plugin",
      } as any);
      prisma.user.count.mockResolvedValueOnce(2);

      // URL with trailing slash and .git
      await installPluginFromUrlAction({
        repositoryUrl: "github.com/test/test-plugin.git/",
      });

      expect(prisma.installedPlugin.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          repositoryUrl: "https://github.com/test/test-plugin",
        }),
      });
    });

    it("auto-enables for single tenant", async () => {
      prisma.member.findFirst.mockResolvedValueOnce(null);
      prisma.installedPlugin.findUnique.mockResolvedValueOnce(null);
      prisma.installedPlugin.create.mockResolvedValueOnce({
        id: "new-plugin-id",
        pluginId: "test-plugin",
      } as any);
      prisma.user.count.mockResolvedValueOnce(1); // single tenant

      await installPluginFromUrlAction(validInput);

      expect(prisma.pluginUserSettings.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          pluginId: "new-plugin-id",
          userId: "user-123",
          enabled: true,
        }),
      });
    });
  });
});

describe("Feature Flag Gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.FEATURE_PLUGINS_ENABLED = false;
  });

  const actions = [
    {
      name: "installPluginAction",
      fn: installPluginAction,
      input: {
        pluginId: "test",
        repositoryUrl: "https://github.com/test/test",
        version: "1.0.0",
        versionType: "release" as const,
      },
    },
    {
      name: "updatePluginAction",
      fn: updatePluginAction,
      input: { pluginId: "test" },
    },
    {
      name: "uninstallPluginAction",
      fn: uninstallPluginAction,
      input: { pluginId: "test" },
    },
    {
      name: "togglePluginEnabledAction",
      fn: togglePluginEnabledAction,
      input: { pluginId: "test", enabled: true },
    },
    {
      name: "updatePluginSettingsAction",
      fn: updatePluginSettingsAction,
      input: { pluginId: "test", settings: {} },
    },
    {
      name: "updateAllPluginsAction",
      fn: updateAllPluginsAction,
      input: undefined,
    },
    {
      name: "togglePluginGlobalEnabledAction",
      fn: togglePluginGlobalEnabledAction,
      input: { pluginId: "test", enabled: true },
    },
    {
      name: "installPluginFromUrlAction",
      fn: installPluginFromUrlAction,
      input: { repositoryUrl: "https://github.com/test/test" },
    },
  ];

  it.each(actions)(
    "$name blocks when FEATURE_PLUGINS_ENABLED is false",
    async ({ fn, input }) => {
      const result = await (fn as any)(input);
      expect(result?.serverError).toBe("Plugins feature is not enabled");
    },
  );
});
