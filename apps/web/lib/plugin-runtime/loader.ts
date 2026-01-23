import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getPluginSearchPaths, getManifestPath, getEntryPath } from "./paths";
import type { LoadedPlugin, PluginLoadResult, InboxZeroPlugin } from "./types";
import {
  safeParsePluginManifest,
  type PluginManifest,
} from "@/packages/plugin-sdk/src/schemas/plugin-manifest";
import { createScopedLogger } from "@/utils/logger";
import { INBOX_ZERO_VERSION } from "./constants";

const logger = createScopedLogger("plugin-loader");

/**
 * Check if a directory exists and is accessible.
 */
async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a file exists and is accessible.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Compare semver versions.
 * Returns:
 *   -1 if v1 < v2
 *    0 if v1 === v2
 *    1 if v1 > v2
 */
function compareSemver(v1: string, v2: string): number {
  // strip any prerelease/build metadata for simple comparison
  const clean = (v: string) => v.split("-")[0].split("+")[0];
  const parts1 = clean(v1).split(".").map(Number);
  const parts2 = clean(v2).split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const p1 = parts1[i] ?? 0;
    const p2 = parts2[i] ?? 0;
    if (p1 < p2) return -1;
    if (p1 > p2) return 1;
  }

  return 0;
}

/**
 * Check if current Inbox Zero version meets the minimum required version.
 */
function isVersionCompatible(minVersion: string): boolean {
  return compareSemver(INBOX_ZERO_VERSION, minVersion) >= 0;
}

/**
 * Scan a directory for plugin subdirectories.
 * Each subdirectory should contain a plugin.json file.
 *
 * @param basePath - Base directory to scan
 * @returns Array of absolute paths to potential plugin directories
 */
async function scanPluginDirectory(basePath: string): Promise<string[]> {
  if (!(await directoryExists(basePath))) {
    return [];
  }

  try {
    const entries = await fs.readdir(basePath, { withFileTypes: true });
    const pluginDirs: string[] = [];

    for (const entry of entries) {
      // skip hidden directories and files
      if (entry.name.startsWith(".")) {
        continue;
      }

      if (entry.isDirectory()) {
        const pluginPath = path.join(basePath, entry.name);
        const manifestPath = getManifestPath(pluginPath);

        // only include directories that have a plugin.json
        if (await fileExists(manifestPath)) {
          pluginDirs.push(pluginPath);
        }
      }
    }

    return pluginDirs;
  } catch (error) {
    logger.warn("scan failed", {
      path: basePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Load and parse a plugin manifest from a plugin directory.
 *
 * @param pluginDir - Absolute path to plugin directory
 * @returns Parsed manifest or error
 */
async function loadManifest(
  pluginDir: string,
): Promise<
  | { success: true; manifest: PluginManifest }
  | { success: false; error: string }
> {
  const manifestPath = getManifestPath(pluginDir);

  try {
    const content = await fs.readFile(manifestPath, "utf-8");
    const data = JSON.parse(content);
    const result = safeParsePluginManifest(data);

    if (!result.success) {
      const errors = result.error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: `manifest validation failed: ${errors}` };
    }

    return { success: true, manifest: result.data };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { success: false, error: "invalid JSON in plugin.json" };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "failed to read manifest",
    };
  }
}

/**
 * Load a plugin module from its entry file.
 * Note: This uses dynamic import which requires the plugin to be valid ESM.
 *
 * @param pluginDir - Absolute path to plugin directory
 * @param entry - Entry filename from manifest
 * @returns Loaded plugin module or error
 */
async function loadPluginModule(
  pluginDir: string,
  entry: string,
): Promise<
  { success: true; module: InboxZeroPlugin } | { success: false; error: string }
> {
  const entryPath = getEntryPath(pluginDir, entry);

  // check if entry file exists
  if (!(await fileExists(entryPath))) {
    return { success: false, error: `entry file not found: ${entry}` };
  }

  try {
    // dynamic import - works with ESM
    // for TypeScript files, this requires appropriate loader configuration
    // in production, plugins would be pre-compiled to JS
    const imported = await import(entryPath);

    // plugins should export default
    const pluginModule = imported.default ?? imported;

    // basic validation that it looks like a plugin
    if (typeof pluginModule !== "object" || pluginModule === null) {
      return { success: false, error: "plugin module must export an object" };
    }

    return { success: true, module: pluginModule as InboxZeroPlugin };
  } catch (error) {
    return {
      success: false,
      error: `failed to load plugin module: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Load a single plugin from a directory.
 *
 * @param pluginDir - Absolute path to plugin directory
 * @returns LoadedPlugin on success, or error details on failure
 */
async function loadPlugin(pluginDir: string): Promise<PluginLoadResult> {
  // load and validate manifest
  const manifestResult = await loadManifest(pluginDir);
  if (!manifestResult.success) {
    return {
      success: false,
      pluginPath: pluginDir,
      error: manifestResult.error,
    };
  }

  const manifest = manifestResult.manifest;

  // check version compatibility (only if inbox_zero.min_version is specified)
  if (
    manifest.inbox_zero?.min_version &&
    !isVersionCompatible(manifest.inbox_zero.min_version)
  ) {
    return {
      success: false,
      pluginPath: pluginDir,
      error: `requires Inbox Zero v${manifest.inbox_zero.min_version} or later (current: v${INBOX_ZERO_VERSION})`,
    };
  }

  // load the plugin module
  const moduleResult = await loadPluginModule(pluginDir, manifest.entry);
  if (!moduleResult.success) {
    return { success: false, pluginPath: pluginDir, error: moduleResult.error };
  }

  return {
    success: true,
    plugin: {
      id: manifest.id,
      manifest,
      module: moduleResult.module,
      path: pluginDir,
    },
  };
}

/**
 * Scan all plugin directories and load valid plugins.
 *
 * Scans directories in order:
 * 1. INBOX_ZERO_PLUGINS_PATH env override (development)
 * 2. External XDG path (self-hosted user-installed)
 * 3. Bundled fallback (shipped with app)
 *
 * Plugins with the same ID from earlier paths take precedence over later paths.
 *
 * @returns Object with loaded plugins and any load errors
 */
export async function loadPlugins(): Promise<{
  plugins: LoadedPlugin[];
  errors: Array<{ pluginPath: string; error: string }>;
}> {
  const searchPaths = getPluginSearchPaths();
  const loadedPlugins: Map<string, LoadedPlugin> = new Map();
  const loadErrors: Array<{ pluginPath: string; error: string }> = [];

  logger.trace("scanning plugin directories", { paths: searchPaths });

  for (const basePath of searchPaths) {
    const pluginDirs = await scanPluginDirectory(basePath);

    for (const pluginDir of pluginDirs) {
      const result = await loadPlugin(pluginDir);

      if (result.success) {
        const { plugin } = result;

        // only load if not already loaded from higher-priority path
        if (loadedPlugins.has(plugin.id)) {
          logger.trace("skipping duplicate plugin", {
            id: plugin.id,
            skippedPath: pluginDir,
            loadedFrom: loadedPlugins.get(plugin.id)?.path,
          });
          continue;
        }

        loadedPlugins.set(plugin.id, plugin);
        logger.info("loaded plugin", {
          id: plugin.id,
          version: plugin.manifest.version,
          capabilities: plugin.manifest.capabilities,
        });
      } else {
        loadErrors.push({ pluginPath: result.pluginPath, error: result.error });
        logger.error("failed to load plugin", {
          path: result.pluginPath,
          error: result.error,
        });
      }
    }
  }

  const plugins = Array.from(loadedPlugins.values());
  logger.info("plugin loading complete", {
    loaded: plugins.length,
    errors: loadErrors.length,
  });

  return { plugins, errors: loadErrors };
}

/**
 * Load a specific plugin by ID from the first matching path.
 *
 * @param pluginId - The plugin identifier to load
 * @returns LoadedPlugin on success, or null if not found/failed
 */
export async function loadPluginById(
  pluginId: string,
): Promise<LoadedPlugin | null> {
  const searchPaths = getPluginSearchPaths();

  for (const basePath of searchPaths) {
    const pluginDir = path.join(basePath, pluginId);

    if (!(await directoryExists(pluginDir))) {
      continue;
    }

    const manifestPath = getManifestPath(pluginDir);
    if (!(await fileExists(manifestPath))) {
      continue;
    }

    const result = await loadPlugin(pluginDir);
    if (result.success) {
      return result.plugin;
    }

    // log error but continue to check other paths
    logger.warn("failed to load plugin from path", {
      id: pluginId,
      path: pluginDir,
      error: result.error,
    });
  }

  return null;
}

/**
 * Get all discoverable plugin directories without loading them.
 * Useful for listing available plugins.
 *
 * @returns Array of plugin directory paths with their manifest ID (if readable)
 */
export async function discoverPlugins(): Promise<
  Array<{ path: string; id: string | null; error?: string }>
> {
  const searchPaths = getPluginSearchPaths();
  const discovered: Array<{ path: string; id: string | null; error?: string }> =
    [];
  const seenIds = new Set<string>();

  for (const basePath of searchPaths) {
    const pluginDirs = await scanPluginDirectory(basePath);

    for (const pluginDir of pluginDirs) {
      const manifestResult = await loadManifest(pluginDir);

      if (manifestResult.success) {
        const { manifest } = manifestResult;

        // skip duplicates
        if (seenIds.has(manifest.id)) {
          continue;
        }

        seenIds.add(manifest.id);
        discovered.push({ path: pluginDir, id: manifest.id });
      } else {
        discovered.push({
          path: pluginDir,
          id: null,
          error: manifestResult.error,
        });
      }
    }
  }

  return discovered;
}

/**
 * Get the current Inbox Zero version used for compatibility checks.
 */
export function getInboxZeroVersion(): string {
  return INBOX_ZERO_VERSION;
}
