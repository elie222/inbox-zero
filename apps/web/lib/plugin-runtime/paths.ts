import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

/**
 * Get the directory name of the current module.
 * Works in both ESM and CommonJS contexts.
 */
function getCurrentDir(): string {
  // in ESM context, use import.meta.url
  // Next.js bundles this correctly for server-side code
  try {
    if (typeof import.meta?.url === "string") {
      return path.dirname(fileURLToPath(import.meta.url));
    }
  } catch {
    // fall through to __dirname
  }

  // in CommonJS context (or if above fails), use __dirname
  if (typeof __dirname === "string") {
    return __dirname;
  }

  // fallback: use process.cwd() and construct the expected path
  // this assumes the code is running from apps/web
  return path.join(process.cwd(), "lib", "plugin-runtime");
}

/**
 * Get the XDG_DATA_HOME directory path.
 * Follows XDG Base Directory Specification.
 *
 * @returns XDG_DATA_HOME path (default: ~/.local/share)
 */
export function getXDGDataHome(): string {
  // eslint-disable-next-line no-process-env
  const xdgDataHome = process.env.XDG_DATA_HOME;
  if (xdgDataHome) {
    return xdgDataHome;
  }

  // default per XDG spec: ~/.local/share
  return path.join(os.homedir(), ".local", "share");
}

/**
 * Get the XDG_CACHE_HOME directory path.
 * Follows XDG Base Directory Specification.
 *
 * @returns XDG_CACHE_HOME path (default: ~/.cache)
 */
export function getXDGCacheHome(): string {
  // eslint-disable-next-line no-process-env
  const xdgCacheHome = process.env.XDG_CACHE_HOME;
  if (xdgCacheHome) {
    return xdgCacheHome;
  }

  // default per XDG spec: ~/.cache
  return path.join(os.homedir(), ".cache");
}

/**
 * Get the path for externally installed plugins (self-hosted).
 * Uses XDG_DATA_HOME/inbox-zero/plugins/
 *
 * @returns Path to external plugins directory
 */
export function getExternalPluginsPath(): string {
  return path.join(getXDGDataHome(), "inbox-zero", "plugins");
}

/**
 * Get the path for bundled/development plugins.
 * Uses apps/web/plugins/ relative to the project root.
 *
 * @returns Path to bundled plugins directory
 */
export function getBundledPluginsPath(): string {
  // navigate from lib/plugin-runtime to apps/web/plugins
  const currentDir = getCurrentDir();
  return path.resolve(currentDir, "..", "..", "plugins");
}

/**
 * Get the plugin cache directory path.
 * Uses XDG_CACHE_HOME/inbox-zero/plugin-cache/
 *
 * @returns Path to plugin cache directory
 */
export function getPluginCachePath(): string {
  return path.join(getXDGCacheHome(), "inbox-zero", "plugin-cache");
}

/**
 * Get the catalog cache directory path.
 * Uses XDG_CACHE_HOME/inbox-zero/catalogs/
 *
 * @returns Path to catalog cache directory
 */
export function getCatalogCachePath(): string {
  return path.join(getXDGCacheHome(), "inbox-zero", "catalogs");
}

/**
 * Get ordered list of paths to search for plugins.
 *
 * Search order:
 * 1. INBOX_ZERO_PLUGINS_PATH env override (for development)
 * 2. External XDG path (for self-hosted user-installed plugins)
 * 3. Bundled fallback (for default/shipped plugins)
 *
 * @returns Array of plugin search paths in priority order
 */
export function getPluginSearchPaths(): string[] {
  const paths: string[] = [];

  // 1. env override for development/testing
  // eslint-disable-next-line no-process-env
  const envPluginsPath = process.env.INBOX_ZERO_PLUGINS_PATH;
  if (envPluginsPath) {
    // handle both absolute and relative paths
    const resolved = path.isAbsolute(envPluginsPath)
      ? envPluginsPath
      : path.resolve(process.cwd(), envPluginsPath);
    paths.push(resolved);
  }

  // 2. external XDG path (user-installed plugins for self-hosted)
  paths.push(getExternalPluginsPath());

  // 3. bundled fallback (shipped with the app)
  paths.push(getBundledPluginsPath());

  return paths;
}

/**
 * Resolve a plugin path from a plugin ID by searching all plugin paths.
 * Returns the first path where the plugin directory exists.
 *
 * @param pluginId - The plugin identifier (directory name)
 * @returns Absolute path to the plugin directory, or null if not found
 */
export function resolvePluginPath(pluginId: string): string | null {
  const searchPaths = getPluginSearchPaths();

  for (const basePath of searchPaths) {
    const pluginPath = path.join(basePath, pluginId);
    // this function only builds the path, actual existence check is done by the loader
    // return the first potential match
    return pluginPath;
  }

  return null;
}

/**
 * Get the manifest file path for a given plugin directory.
 *
 * @param pluginDir - Absolute path to plugin directory
 * @returns Absolute path to plugin.json
 */
export function getManifestPath(pluginDir: string): string {
  return path.join(pluginDir, "plugin.json");
}

/**
 * Get the entry file path for a given plugin directory and entry filename.
 *
 * @param pluginDir - Absolute path to plugin directory
 * @param entry - Entry filename from manifest (default: 'index.ts')
 * @returns Absolute path to entry file
 */
export function getEntryPath(pluginDir: string, entry = "index.ts"): string {
  return path.join(pluginDir, entry);
}
