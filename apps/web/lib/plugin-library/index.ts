/**
 * Plugin Library - GitHub catalog fetching and plugin installation
 *
 * This module provides the infrastructure for:
 * - Fetching plugin catalogs from GitHub repositories
 * - Downloading and installing plugins from releases or branches
 * - Managing installed plugins (list, remove, check versions)
 * - HACS-style version selection (releases + development branches)
 */

// Catalog operations
export {
  fetchCatalogPlugins,
  fetchPluginManifest,
  fetchPluginVersions,
  getDefaultBranch,
  getLatestCommit,
  getTarballUrl,
  hasGitHubRelease,
  hasPluginTopic,
  type CatalogEntry,
  type CatalogPlugin,
  type PluginVersion,
  type TrustLevel,
} from "./catalog";

// Download and installation operations
export {
  downloadAndExtractPlugin,
  downloadPlugin,
  removePlugin,
  isPluginInstalled,
  getInstalledPlugin,
  listInstalledPlugins,
  resolvePluginsDir,
  resolveCacheDir,
  type DownloadResult,
  type DownloadOptions,
} from "./download";

// Allowlist operations
export {
  getEffectiveAllowlist,
  isPluginAllowed,
  filterAllowedPlugins,
} from "./allowlist";
