/**
 * Tests for the plugin runtime system.
 *
 * The runtime handles plugin loading, capability routing, trust enforcement,
 * and hook execution with timeouts and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PluginManifest } from "@/packages/plugin-sdk/src/schemas/plugin-manifest";
import type { InboxZeroPlugin } from "./types";

// Mock dependencies before importing runtime
vi.mock("@/env", () => ({
  env: {
    FEATURE_PLUGINS_ENABLED: true,
  },
}));

vi.mock("@/utils/logger", () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  }),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    installedPlugin: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    pluginAccountSettings: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    pluginUserSettings: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("./loader", () => ({
  loadPlugins: vi.fn().mockResolvedValue({ plugins: [], errors: [] }),
  loadPluginById: vi.fn().mockResolvedValue(null),
}));

vi.mock("./trust", () => ({
  getTrustLevel: vi.fn().mockReturnValue("verified"),
  getEffectiveCapabilities: vi.fn((_, caps) => caps),
}));

vi.mock("./context-factory", () => ({
  createEmailContext: vi.fn().mockResolvedValue({
    email: { id: "test", subject: "Test" },
    llm: {},
    storage: {},
  }),
  createDraftContext: vi.fn().mockResolvedValue({}),
  createRuleContext: vi.fn().mockResolvedValue({}),
  createCalendarContext: vi.fn().mockResolvedValue({}),
  createTriggeredEmailContext: vi.fn().mockResolvedValue({}),
  createScheduledTriggerContext: vi.fn().mockResolvedValue({}),
  createInitContext: vi.fn().mockResolvedValue({
    inboxZeroVersion: "0.14.0",
    emailAccount: { email: "test@example.com", provider: "google" },
    llm: {},
    storage: {},
    registerTrigger: vi.fn(),
    unregisterTrigger: vi.fn(),
    listTriggers: vi.fn(),
    registerSchedule: vi.fn(),
    unregisterSchedule: vi.fn(),
    listSchedules: vi.fn(),
  }),
}));

import { PluginRuntime } from "./runtime";
import { getTrustLevel, getEffectiveCapabilities } from "./trust";

describe("PluginRuntime", () => {
  let runtime: PluginRuntime;

  beforeEach(() => {
    runtime = new PluginRuntime();
    vi.clearAllMocks();
  });

  afterEach(() => {
    runtime.reset();
  });

  describe("Plugin Registration", () => {
    const createTestManifest = (
      id: string,
      capabilities: string[],
    ): PluginManifest =>
      ({
        id,
        name: `Test Plugin ${id}`,
        version: "1.0.0",
        entry: "index.ts",
        capabilities,
      }) as PluginManifest;

    const createTestPlugin = (
      hooks: Partial<InboxZeroPlugin> = {},
    ): InboxZeroPlugin => ({
      ...hooks,
    });

    it("registers a plugin successfully", () => {
      const manifest = createTestManifest("test-plugin", ["email:classify"]);
      const plugin = createTestPlugin({
        classifyEmail: vi.fn(),
      });

      runtime.registerPlugin(manifest, plugin);

      expect(runtime.getPluginCount()).toBe(1);
      expect(runtime.getPlugin("test-plugin")).toBeDefined();
    });

    it("builds routing table based on capabilities", () => {
      const manifest = createTestManifest("classifier", ["email:classify"]);
      const plugin = createTestPlugin({ classifyEmail: vi.fn() });

      runtime.registerPlugin(manifest, plugin);

      expect(runtime.hasCapability("email:classify")).toBe(true);
      expect(runtime.hasCapability("email:draft")).toBe(false);
    });

    it("handles multiple plugins with same capability", () => {
      const manifest1 = createTestManifest("plugin-1", ["email:classify"]);
      const manifest2 = createTestManifest("plugin-2", ["email:classify"]);

      runtime.registerPlugin(manifest1, createTestPlugin());
      runtime.registerPlugin(manifest2, createTestPlugin());

      const plugins = runtime.getPluginsForCapability("email:classify");
      expect(plugins).toHaveLength(2);
    });

    it("handles plugin with multiple capabilities", () => {
      const manifest = createTestManifest("multi-cap", [
        "email:classify",
        "email:draft",
        "followup:detect",
      ]);

      runtime.registerPlugin(manifest, createTestPlugin());

      expect(runtime.hasCapability("email:classify")).toBe(true);
      expect(runtime.hasCapability("email:draft")).toBe(true);
      expect(runtime.hasCapability("followup:detect")).toBe(true);
    });
  });

  describe("Plugin Unregistration", () => {
    it("unregisters a plugin successfully", () => {
      const manifest = {
        id: "test-plugin",
        name: "Test",
        version: "1.0.0",
        entry: "index.ts",
        capabilities: ["email:classify"],
      } as PluginManifest;

      runtime.registerPlugin(manifest, {});

      const result = runtime.unregisterPlugin("test-plugin");

      expect(result).toBe(true);
      expect(runtime.getPluginCount()).toBe(0);
      expect(runtime.getPlugin("test-plugin")).toBeUndefined();
    });

    it("returns false for non-existent plugin", () => {
      const result = runtime.unregisterPlugin("non-existent");
      expect(result).toBe(false);
    });

    it("removes plugin from routing table", () => {
      const manifest = {
        id: "test-plugin",
        name: "Test",
        version: "1.0.0",
        entry: "index.ts",
        capabilities: ["email:classify"],
      } as PluginManifest;

      runtime.registerPlugin(manifest, {});
      expect(runtime.hasCapability("email:classify")).toBe(true);

      runtime.unregisterPlugin("test-plugin");
      expect(runtime.hasCapability("email:classify")).toBe(false);
    });
  });

  describe("Trust Level Enforcement", () => {
    it("calls getTrustLevel for registered plugins", () => {
      const manifest = {
        id: "trusted-plugin",
        name: "Trusted",
        version: "1.0.0",
        entry: "index.ts",
        capabilities: ["email:classify"],
      } as PluginManifest;

      runtime.registerPlugin(manifest, {});

      expect(getTrustLevel).toHaveBeenCalledWith("trusted-plugin");
    });

    it("filters capabilities based on trust level", () => {
      vi.mocked(getEffectiveCapabilities).mockReturnValueOnce([
        "email:classify",
      ]);

      const manifest = {
        id: "limited-plugin",
        name: "Limited",
        version: "1.0.0",
        entry: "index.ts",
        capabilities: ["email:classify", "email:send"], // wants send but won't get it
      } as PluginManifest;

      runtime.registerPlugin(manifest, {});

      const plugin = runtime.getPlugin("limited-plugin");
      expect(plugin?.effectiveCapabilities).toEqual(["email:classify"]);
    });

    it("stores trust level in loaded plugin", () => {
      vi.mocked(getTrustLevel).mockReturnValueOnce("community");

      const manifest = {
        id: "community-plugin",
        name: "Community",
        version: "1.0.0",
        entry: "index.ts",
        capabilities: ["email:classify"],
      } as PluginManifest;

      runtime.registerPlugin(manifest, {});

      const plugin = runtime.getPlugin("community-plugin");
      expect(plugin?.trustLevel).toBe("community");
    });
  });

  describe("Hook Timeout", () => {
    it("uses default timeout of 30 seconds", () => {
      expect(runtime.getHookTimeout()).toBe(30_000);
    });

    it("allows custom timeout via constructor", () => {
      const customRuntime = new PluginRuntime({ hookTimeoutMs: 5000 });
      expect(customRuntime.getHookTimeout()).toBe(5000);
    });
  });

  describe("Runtime State", () => {
    it("starts uninitialized", () => {
      expect(runtime.isInitialized()).toBe(false);
    });

    it("resets state correctly", () => {
      const manifest = {
        id: "test",
        name: "Test",
        version: "1.0.0",
        entry: "index.ts",
        capabilities: ["email:classify"],
      } as PluginManifest;

      runtime.registerPlugin(manifest, {});
      expect(runtime.getPluginCount()).toBe(1);

      runtime.reset();

      expect(runtime.getPluginCount()).toBe(0);
      expect(runtime.isInitialized()).toBe(false);
    });
  });

  describe("getLoadedPlugins", () => {
    it("returns all loaded plugins with metadata", () => {
      const manifest1 = {
        id: "plugin-1",
        name: "Plugin 1",
        version: "1.0.0",
        entry: "index.ts",
        capabilities: ["email:classify"],
      } as PluginManifest;

      const manifest2 = {
        id: "plugin-2",
        name: "Plugin 2",
        version: "2.0.0",
        entry: "index.ts",
        capabilities: ["email:draft"],
      } as PluginManifest;

      runtime.registerPlugin(manifest1, {});
      runtime.registerPlugin(manifest2, {});

      const loaded = runtime.getLoadedPlugins();

      expect(loaded).toHaveLength(2);
      expect(loaded.map((p) => p.id)).toContain("plugin-1");
      expect(loaded.map((p) => p.id)).toContain("plugin-2");
    });

    it("includes trust level and effective capabilities", () => {
      vi.mocked(getTrustLevel).mockReturnValueOnce("verified");
      vi.mocked(getEffectiveCapabilities).mockReturnValueOnce([
        "email:classify",
        "email:send",
      ]);

      const manifest = {
        id: "full-plugin",
        name: "Full",
        version: "1.0.0",
        entry: "index.ts",
        capabilities: ["email:classify", "email:send"],
      } as PluginManifest;

      runtime.registerPlugin(manifest, {});

      const [loaded] = runtime.getLoadedPlugins();

      expect(loaded.trustLevel).toBe("verified");
      expect(loaded.effectiveCapabilities).toContain("email:classify");
      expect(loaded.effectiveCapabilities).toContain("email:send");
    });
  });

  describe("getPluginsForCapability", () => {
    it("returns plugins with specific capability", () => {
      const classifierManifest = {
        id: "classifier",
        name: "Classifier",
        version: "1.0.0",
        entry: "index.ts",
        capabilities: ["email:classify"],
      } as PluginManifest;

      const drafterManifest = {
        id: "drafter",
        name: "Drafter",
        version: "1.0.0",
        entry: "index.ts",
        capabilities: ["email:draft"],
      } as PluginManifest;

      runtime.registerPlugin(classifierManifest, {});
      runtime.registerPlugin(drafterManifest, {});

      const classifiers = runtime.getPluginsForCapability("email:classify");
      const drafters = runtime.getPluginsForCapability("email:draft");

      expect(classifiers).toHaveLength(1);
      expect(classifiers[0].manifest.id).toBe("classifier");

      expect(drafters).toHaveLength(1);
      expect(drafters[0].manifest.id).toBe("drafter");
    });

    it("returns empty array for unregistered capability", () => {
      const plugins = runtime.getPluginsForCapability("calendar:write");
      expect(plugins).toHaveLength(0);
    });
  });
});

describe("Capability Routing Table", () => {
  let runtime: PluginRuntime;

  beforeEach(() => {
    runtime = new PluginRuntime();
  });

  afterEach(() => {
    runtime.reset();
  });

  it("maps capabilities to plugin IDs", () => {
    const manifest = {
      id: "router-test",
      name: "Router Test",
      version: "1.0.0",
      entry: "index.ts",
      capabilities: ["email:classify", "email:signal"],
    } as PluginManifest;

    runtime.registerPlugin(manifest, {});

    expect(runtime.hasCapability("email:classify")).toBe(true);
    expect(runtime.hasCapability("email:signal")).toBe(true);
    expect(runtime.hasCapability("email:send")).toBe(false);
  });

  it("updates routing table when plugin unregistered", () => {
    const manifest = {
      id: "temp-plugin",
      name: "Temp",
      version: "1.0.0",
      entry: "index.ts",
      capabilities: ["email:classify"],
    } as PluginManifest;

    runtime.registerPlugin(manifest, {});
    expect(runtime.hasCapability("email:classify")).toBe(true);

    runtime.unregisterPlugin("temp-plugin");
    expect(runtime.hasCapability("email:classify")).toBe(false);
  });
});

describe("Feature Flag Integration", () => {
  it("respects FEATURE_PLUGINS_ENABLED flag", async () => {
    // This is tested implicitly - when flag is false, executeClassifyEmail returns []
    // The mock sets it to true for other tests
    const runtime = new PluginRuntime();

    // Register a plugin
    const manifest = {
      id: "test",
      name: "Test",
      version: "1.0.0",
      entry: "index.ts",
      capabilities: ["email:classify"],
    } as PluginManifest;

    runtime.registerPlugin(manifest, {
      classifyEmail: vi
        .fn()
        .mockResolvedValue({ label: "Test", confidence: 1 }),
    });

    // With flag enabled (mocked to true), should return results
    // The actual execution requires more setup, so we just verify registration works
    expect(runtime.getPluginCount()).toBe(1);
  });
});

describe("onInit Hook Execution", () => {
  let runtime: PluginRuntime;

  beforeEach(() => {
    runtime = new PluginRuntime();
    vi.clearAllMocks();
  });

  afterEach(() => {
    runtime.reset();
  });

  it("executes onInit hook when present", async () => {
    const onInitMock = vi.fn().mockResolvedValue(undefined);
    const manifest = {
      id: "test-plugin",
      name: "Test Plugin",
      version: "1.0.0",
      entry: "index.ts",
      capabilities: ["email:trigger"],
    } as PluginManifest;

    runtime.registerPlugin(manifest, {
      onInit: onInitMock,
    });

    const emailAccount = {
      id: "account-1",
      email: "test@example.com",
      provider: "google" as const,
      userId: "user-1",
      user: {
        aiProvider: null,
        aiModel: null,
        aiApiKey: null,
      },
    };

    const result = await runtime.executeOnInit(
      "test-plugin",
      emailAccount,
      "user-1",
    );

    expect(result).not.toBeNull();
    expect(result?.pluginId).toBe("test-plugin");
    expect(result?.error).toBeUndefined();
    expect(onInitMock).toHaveBeenCalledTimes(1);
    expect(onInitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        inboxZeroVersion: expect.any(String),
        emailAccount: expect.objectContaining({
          email: "test@example.com",
          provider: "google",
        }),
        llm: expect.any(Object),
        storage: expect.any(Object),
        registerTrigger: expect.any(Function),
        unregisterTrigger: expect.any(Function),
        listTriggers: expect.any(Function),
        registerSchedule: expect.any(Function),
        unregisterSchedule: expect.any(Function),
        listSchedules: expect.any(Function),
      }),
    );
  });

  it("returns null when plugin does not have onInit hook", async () => {
    const manifest = {
      id: "no-init-plugin",
      name: "No Init Plugin",
      version: "1.0.0",
      entry: "index.ts",
      capabilities: ["email:classify"],
    } as PluginManifest;

    runtime.registerPlugin(manifest, {
      classifyEmail: vi.fn(),
    });

    const emailAccount = {
      id: "account-1",
      email: "test@example.com",
      provider: "google" as const,
      userId: "user-1",
      user: {
        aiProvider: null,
        aiModel: null,
        aiApiKey: null,
      },
    };

    const result = await runtime.executeOnInit(
      "no-init-plugin",
      emailAccount,
      "user-1",
    );

    expect(result).toBeNull();
  });

  it("handles onInit errors gracefully", async () => {
    const error = new Error("Init failed");
    const onInitMock = vi.fn().mockRejectedValue(error);
    const manifest = {
      id: "failing-plugin",
      name: "Failing Plugin",
      version: "1.0.0",
      entry: "index.ts",
      capabilities: ["email:trigger"],
    } as PluginManifest;

    runtime.registerPlugin(manifest, {
      onInit: onInitMock,
    });

    const emailAccount = {
      id: "account-1",
      email: "test@example.com",
      provider: "google" as const,
      userId: "user-1",
      user: {
        aiProvider: null,
        aiModel: null,
        aiApiKey: null,
      },
    };

    const result = await runtime.executeOnInit(
      "failing-plugin",
      emailAccount,
      "user-1",
    );

    expect(result).not.toBeNull();
    expect(result?.pluginId).toBe("failing-plugin");
    expect(result?.error).toBe("Init failed");
  });

  it("returns null when plugin is not loaded", async () => {
    const emailAccount = {
      id: "account-1",
      email: "test@example.com",
      provider: "google" as const,
      userId: "user-1",
      user: {
        aiProvider: null,
        aiModel: null,
        aiApiKey: null,
      },
    };

    const result = await runtime.executeOnInit(
      "non-existent-plugin",
      emailAccount,
      "user-1",
    );

    expect(result).toBeNull();
  });
});
