import { mkdir, rm, readFile, readdir, rename, stat } from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import * as tar from "tar";
import {
  type PluginManifest,
  safeParsePluginManifest,
} from "@inbox-zero/plugin-sdk";
import { getTarballUrl, getLatestCommit } from "./catalog";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface DownloadResult {
  /** Absolute path to the installed plugin directory */
  path: string;
  /** Parsed plugin manifest */
  manifest: PluginManifest;
  /** The ref (tag or branch) that was downloaded */
  ref: string;
  /** Commit SHA for branch installs, undefined for release installs */
  commitSha?: string;
}

export interface DownloadOptions {
  /** Plugin ID (used for target directory name) */
  pluginId: string;
  /** GitHub repository URL */
  repositoryUrl: string;
  /** Git ref to download (tag name for releases, branch name for dev) */
  ref: string;
  /** Base directory for plugins (e.g., ~/.local/share/inbox-zero/plugins) */
  pluginsDir: string;
  /** Whether this is a branch (development) install */
  isBranch?: boolean;
}

// -----------------------------------------------------------------------------
// Plugin Directory Resolution
// -----------------------------------------------------------------------------

/**
 * Resolves the plugins directory path based on deployment environment.
 *
 * Order of precedence:
 * 1. INBOX_ZERO_PLUGINS_PATH env var (development override)
 * 2. XDG_DATA_HOME/inbox-zero/plugins (self-hosted standard)
 * 3. ~/.local/share/inbox-zero/plugins (XDG default fallback)
 */
export function resolvePluginsDir(): string {
  // eslint-disable-next-line no-process-env
  const envPath = process.env.INBOX_ZERO_PLUGINS_PATH;
  if (envPath) {
    return envPath;
  }

  // eslint-disable-next-line no-process-env
  const xdgDataHome = process.env.XDG_DATA_HOME;
  if (xdgDataHome) {
    return join(xdgDataHome, "inbox-zero", "plugins");
  }

  // XDG default: ~/.local/share
  // eslint-disable-next-line no-process-env
  const home = process.env.HOME ?? "/tmp";
  return join(home, ".local", "share", "inbox-zero", "plugins");
}

/**
 * Resolves the plugin cache directory for temporary downloads.
 *
 * Uses XDG_CACHE_HOME or falls back to ~/.cache
 */
export function resolveCacheDir(): string {
  // eslint-disable-next-line no-process-env
  const xdgCacheHome = process.env.XDG_CACHE_HOME;
  if (xdgCacheHome) {
    return join(xdgCacheHome, "inbox-zero", "plugin-cache");
  }

  // eslint-disable-next-line no-process-env
  const home = process.env.HOME ?? "/tmp";
  return join(home, ".cache", "inbox-zero", "plugin-cache");
}

// -----------------------------------------------------------------------------
// Download and Extract
// -----------------------------------------------------------------------------

/**
 * Downloads and extracts a plugin from a GitHub repository.
 *
 * This is the main entry point for plugin installation. It:
 * 1. Downloads the tarball from GitHub
 * 2. Extracts to a temporary location
 * 3. Validates the plugin.json manifest
 * 4. Moves to the final plugins directory
 *
 * @param options - Download configuration
 * @returns Download result with path and manifest
 */
export async function downloadAndExtractPlugin(
  options: DownloadOptions,
): Promise<DownloadResult> {
  const { pluginId, repositoryUrl, ref, pluginsDir, isBranch } = options;

  // resolve commit SHA for branch installs
  let commitSha: string | undefined;
  if (isBranch) {
    commitSha = await getLatestCommit(repositoryUrl, ref);
  }

  // ensure directories exist
  const cacheDir = resolveCacheDir();
  await mkdir(cacheDir, { recursive: true });
  await mkdir(pluginsDir, { recursive: true });

  // download tarball to temp location
  const tarballPath = join(cacheDir, `${pluginId}-${Date.now()}.tar.gz`);
  const extractPath = join(cacheDir, `${pluginId}-${Date.now()}-extract`);

  try {
    // download the tarball
    await downloadTarball(repositoryUrl, ref, tarballPath);

    // extract to temp directory
    await extractTarball(tarballPath, extractPath);

    // find the extracted directory (GitHub wraps in owner-repo-sha folder)
    const extractedDir = await findExtractedDir(extractPath);

    // validate plugin.json exists and is valid
    const manifest = await validatePluginDir(extractedDir);

    // verify plugin ID matches
    if (manifest.id !== pluginId) {
      throw new Error(
        `Plugin ID mismatch: expected "${pluginId}" but plugin.json has "${manifest.id}"`,
      );
    }

    // move to final location (remove existing first)
    const targetPath = join(pluginsDir, pluginId);
    if (existsSync(targetPath)) {
      await rm(targetPath, { recursive: true });
    }

    await rename(extractedDir, targetPath);

    return {
      path: targetPath,
      manifest,
      ref,
      commitSha: commitSha?.slice(0, 7),
    };
  } finally {
    // cleanup temp files
    await cleanupTemp(tarballPath, extractPath);
  }
}

/**
 * Convenience function for downloading a plugin by repository URL and version.
 *
 * @param repositoryUrl - GitHub repository URL
 * @param ref - Version tag (e.g., "v1.0.0") or branch name (e.g., "main")
 * @param pluginId - Plugin ID for directory naming
 * @returns Download result with path and manifest
 */
export async function downloadPlugin(
  repositoryUrl: string,
  ref: string,
  pluginId: string,
): Promise<DownloadResult> {
  const pluginsDir = resolvePluginsDir();

  // determine if this is a branch or tag
  // tags typically start with 'v' or are semver-like
  const isBranch = !ref.match(/^v?\d+\.\d+\.\d+/) && !ref.startsWith("v");

  return downloadAndExtractPlugin({
    pluginId,
    repositoryUrl,
    ref,
    pluginsDir,
    isBranch,
  });
}

// -----------------------------------------------------------------------------
// Tarball Operations
// -----------------------------------------------------------------------------

/**
 * Download a tarball from GitHub to a local file.
 */
async function downloadTarball(
  repositoryUrl: string,
  ref: string,
  targetPath: string,
): Promise<void> {
  const tarballUrl = getTarballUrl(repositoryUrl, ref);

  // eslint-disable-next-line no-process-env
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "inbox-zero-plugin-library",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(tarballUrl, { headers });

  if (!response.ok) {
    throw new Error(
      `Failed to download tarball: ${response.status} ${response.statusText}`,
    );
  }

  if (!response.body) {
    throw new Error("No response body from tarball download");
  }

  // ensure target directory exists
  await mkdir(dirname(targetPath), { recursive: true });

  // stream to file
  const fileStream = createWriteStream(targetPath);
  // @ts-expect-error ReadableStream is not directly compatible with NodeJS.ReadableStream
  await pipeline(response.body, fileStream);
}

/**
 * Extract a tarball to a directory.
 */
async function extractTarball(
  tarballPath: string,
  extractPath: string,
): Promise<void> {
  await mkdir(extractPath, { recursive: true });

  await tar.extract({
    file: tarballPath,
    cwd: extractPath,
  });
}

/**
 * Find the extracted directory inside the temp extraction path.
 *
 * GitHub tarballs extract to a folder like "owner-repo-sha".
 */
async function findExtractedDir(extractPath: string): Promise<string> {
  const entries = await readdir(extractPath);

  // filter to directories only
  const dirs: string[] = [];
  for (const entry of entries) {
    const entryPath = join(extractPath, entry);
    const stats = await stat(entryPath);
    if (stats.isDirectory()) {
      dirs.push(entry);
    }
  }

  if (dirs.length === 0) {
    throw new Error("No directory found in extracted tarball");
  }

  // take the first directory - GitHub tarballs have exactly one
  return join(extractPath, dirs[0]);
}

/**
 * Validate that a directory contains a valid plugin.
 */
async function validatePluginDir(pluginDir: string): Promise<PluginManifest> {
  const manifestPath = join(pluginDir, "plugin.json");

  if (!existsSync(manifestPath)) {
    throw new Error(`plugin.json not found in ${pluginDir}`);
  }

  const content = await readFile(manifestPath, "utf-8");
  const parsed = JSON.parse(content);
  const result = safeParsePluginManifest(parsed);

  if (!result.success) {
    throw new Error(`Invalid plugin.json: ${result.error.message}`);
  }

  return result.data;
}

/**
 * Cleanup temporary files from download.
 */
async function cleanupTemp(
  tarballPath: string,
  extractPath: string,
): Promise<void> {
  try {
    if (existsSync(tarballPath)) {
      await rm(tarballPath);
    }
    if (existsSync(extractPath)) {
      await rm(extractPath, { recursive: true });
    }
  } catch {
    // cleanup failure is non-critical - files will be cleaned up later
  }
}

// -----------------------------------------------------------------------------
// Plugin Management
// -----------------------------------------------------------------------------

/**
 * Remove an installed plugin.
 *
 * @param pluginId - ID of the plugin to remove
 * @param pluginsDir - Optional custom plugins directory
 */
export async function removePlugin(
  pluginId: string,
  pluginsDir?: string,
): Promise<void> {
  const targetDir = pluginsDir ?? resolvePluginsDir();
  const pluginPath = join(targetDir, pluginId);

  if (!existsSync(pluginPath)) {
    throw new Error(`Plugin "${pluginId}" is not installed`);
  }

  await rm(pluginPath, { recursive: true });
}

/**
 * Check if a plugin is installed.
 *
 * @param pluginId - ID of the plugin to check
 * @param pluginsDir - Optional custom plugins directory
 */
export function isPluginInstalled(
  pluginId: string,
  pluginsDir?: string,
): boolean {
  const targetDir = pluginsDir ?? resolvePluginsDir();
  const pluginPath = join(targetDir, pluginId);
  const manifestPath = join(pluginPath, "plugin.json");

  return existsSync(pluginPath) && existsSync(manifestPath);
}

/**
 * Get the installed version of a plugin.
 *
 * @param pluginId - ID of the plugin
 * @param pluginsDir - Optional custom plugins directory
 * @returns Plugin manifest if installed, null otherwise
 */
export async function getInstalledPlugin(
  pluginId: string,
  pluginsDir?: string,
): Promise<PluginManifest | null> {
  const targetDir = pluginsDir ?? resolvePluginsDir();
  const pluginPath = join(targetDir, pluginId);
  const manifestPath = join(pluginPath, "plugin.json");

  if (!existsSync(manifestPath)) {
    return null;
  }

  try {
    const content = await readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(content);
    const result = safeParsePluginManifest(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * List all installed plugins.
 *
 * @param pluginsDir - Optional custom plugins directory
 * @returns Array of installed plugin manifests
 */
export async function listInstalledPlugins(
  pluginsDir?: string,
): Promise<PluginManifest[]> {
  const targetDir = pluginsDir ?? resolvePluginsDir();

  if (!existsSync(targetDir)) {
    return [];
  }

  const entries = await readdir(targetDir);
  const plugins: PluginManifest[] = [];

  for (const entry of entries) {
    const entryPath = join(targetDir, entry);
    const stats = await stat(entryPath);

    if (stats.isDirectory()) {
      const manifest = await getInstalledPlugin(entry, targetDir);
      if (manifest) {
        plugins.push(manifest);
      }
    }
  }

  return plugins;
}
