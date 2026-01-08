import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import {
  getXDGDataHome,
  getXDGCacheHome,
  getExternalPluginsPath,
  getBundledPluginsPath,
  getPluginCachePath,
  getCatalogCachePath,
  getPluginSearchPaths,
  getManifestPath,
  getEntryPath,
} from "./paths";

describe("plugin-runtime/paths", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getXDGDataHome", () => {
    it("returns XDG_DATA_HOME if set", () => {
      process.env.XDG_DATA_HOME = "/custom/data";
      expect(getXDGDataHome()).toBe("/custom/data");
    });

    it("returns default ~/.local/share if not set", () => {
      process.env.XDG_DATA_HOME = undefined;
      const expected = path.join(os.homedir(), ".local", "share");
      expect(getXDGDataHome()).toBe(expected);
    });
  });

  describe("getXDGCacheHome", () => {
    it("returns XDG_CACHE_HOME if set", () => {
      process.env.XDG_CACHE_HOME = "/custom/cache";
      expect(getXDGCacheHome()).toBe("/custom/cache");
    });

    it("returns default ~/.cache if not set", () => {
      process.env.XDG_CACHE_HOME = undefined;
      const expected = path.join(os.homedir(), ".cache");
      expect(getXDGCacheHome()).toBe(expected);
    });
  });

  describe("getExternalPluginsPath", () => {
    it("returns path under XDG_DATA_HOME", () => {
      process.env.XDG_DATA_HOME = "/custom/data";
      expect(getExternalPluginsPath()).toBe("/custom/data/inbox-zero/plugins");
    });
  });

  describe("getBundledPluginsPath", () => {
    it("returns path relative to lib/plugin-runtime", () => {
      const result = getBundledPluginsPath();
      // should end with 'plugins' directory
      expect(result.endsWith("plugins")).toBe(true);
    });
  });

  describe("getPluginCachePath", () => {
    it("returns path under XDG_CACHE_HOME", () => {
      process.env.XDG_CACHE_HOME = "/custom/cache";
      expect(getPluginCachePath()).toBe(
        "/custom/cache/inbox-zero/plugin-cache",
      );
    });
  });

  describe("getCatalogCachePath", () => {
    it("returns path under XDG_CACHE_HOME", () => {
      process.env.XDG_CACHE_HOME = "/custom/cache";
      expect(getCatalogCachePath()).toBe("/custom/cache/inbox-zero/catalogs");
    });
  });

  describe("getPluginSearchPaths", () => {
    it("includes external and bundled paths by default", () => {
      process.env.INBOX_ZERO_PLUGINS_PATH = undefined;
      const paths = getPluginSearchPaths();
      expect(paths.length).toBeGreaterThanOrEqual(2);
      // should include external XDG path
      expect(paths.some((p) => p.includes("inbox-zero/plugins"))).toBe(true);
    });

    it("includes env override path first when set", () => {
      process.env.INBOX_ZERO_PLUGINS_PATH = "/custom/plugins";
      const paths = getPluginSearchPaths();
      expect(paths[0]).toBe("/custom/plugins");
    });

    it("resolves relative env paths", () => {
      process.env.INBOX_ZERO_PLUGINS_PATH = "./test-plugins";
      const paths = getPluginSearchPaths();
      expect(path.isAbsolute(paths[0])).toBe(true);
    });
  });

  describe("getManifestPath", () => {
    it("returns plugin.json path for plugin directory", () => {
      const result = getManifestPath("/plugins/my-plugin");
      expect(result).toBe("/plugins/my-plugin/plugin.json");
    });
  });

  describe("getEntryPath", () => {
    it("returns entry file path with default entry", () => {
      const result = getEntryPath("/plugins/my-plugin");
      expect(result).toBe("/plugins/my-plugin/index.ts");
    });

    it("returns entry file path with custom entry", () => {
      const result = getEntryPath("/plugins/my-plugin", "main.js");
      expect(result).toBe("/plugins/my-plugin/main.js");
    });
  });
});
