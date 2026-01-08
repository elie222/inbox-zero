import { Octokit } from "@octokit/rest";
import {
  type PluginManifest,
  safeParsePluginManifest,
} from "@inbox-zero/plugin-sdk";
import { getTrustLevel } from "@/lib/plugin-runtime/trust";

// -----------------------------------------------------------------------------
// Default Catalogs
// -----------------------------------------------------------------------------

/**
 * Default plugin catalogs to fetch from.
 * Multiple catalogs are supported to allow for community contributions.
 * Plugins from earlier catalogs take precedence if IDs conflict.
 */
export const DEFAULT_CATALOG_URLS = [
  "https://github.com/elie222/zero-catalog",
  "https://github.com/rsnodgrass/zero-catalog",
];

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type TrustLevel = "verified" | "community" | "unverified";

/**
 * Plugin entry from the catalog (catalog.json in catalog repo).
 * Note: catalogs do NOT set trust levels. Trust levels come from
 * the internal trust registry maintained by Inbox Zero.
 */
export interface CatalogEntry {
  /** Plugin ID (must match plugin.json id) */
  id: string;
  /** GitHub repository URL */
  repository: string;
  /** Plugin category for store browsing */
  category?: string;
  /** Brief description */
  description?: string;
  /** Plugin author */
  author?: string;
  /** Search keywords for discovery */
  keywords?: string[];
  /** Screenshot URLs for store listing */
  screenshots?: string[];
}

/**
 * Full catalog plugin info with metadata from plugin.json
 */
export interface CatalogPlugin {
  id: string;
  name: string;
  description: string;
  repositoryUrl: string;
  author: string;
  version: string;
  trustLevel: TrustLevel;
  category: string;
  keywords: string[];
  screenshots: string[];
  downloads?: number;
  minInboxZeroVersion?: string;
}

/**
 * Version info for a plugin from GitHub releases
 */
export interface PluginVersion {
  version: string;
  type: "release" | "branch";
  tag?: string;
  commitSha?: string;
  releasedAt?: Date;
  releaseNotes?: string;
  prerelease: boolean;
  minInboxZeroVersion?: string;
}

/**
 * Parsed owner/repo from GitHub URL
 */
interface RepoInfo {
  owner: string;
  repo: string;
}

// -----------------------------------------------------------------------------
// GitHub URL Parsing & Validation
// -----------------------------------------------------------------------------

/**
 * Validate that a URL is a GitHub URL.
 * Only https://github.com URLs are allowed for security.
 */
export function isValidGitHubUrl(url: string): boolean {
  return url.startsWith("https://github.com/");
}

/**
 * Parse owner and repo from a GitHub repository URL.
 * Only accepts https://github.com URLs for security.
 */
function parseGitHubUrl(repositoryUrl: string): RepoInfo {
  // SECURITY: Only allow https://github.com URLs
  if (!isValidGitHubUrl(repositoryUrl)) {
    throw new Error(
      `Invalid URL: only https://github.com URLs are allowed. Got: ${repositoryUrl}`,
    );
  }

  // Extract owner/repo from https://github.com/owner/repo format
  const match = repositoryUrl.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/,
  );

  if (match) {
    return { owner: match[1], repo: match[2] };
  }

  throw new Error(`Invalid GitHub repository URL: ${repositoryUrl}`);
}

// -----------------------------------------------------------------------------
// Octokit Instance
// -----------------------------------------------------------------------------

/**
 * Create Octokit instance.
 * Uses GITHUB_TOKEN if available for higher rate limits.
 */
function createOctokit(): Octokit {
  // eslint-disable-next-line no-process-env
  const token = process.env.GITHUB_TOKEN;
  return new Octokit(token ? { auth: token } : undefined);
}

// -----------------------------------------------------------------------------
// Catalog Fetching
// -----------------------------------------------------------------------------

/**
 * Catalog file structure (catalog.json in catalog repo)
 */
interface CatalogFile {
  lastUpdated?: string;
  plugins: CatalogEntry[];
}

/**
 * Fetch plugins from all default catalogs.
 *
 * Fetches from each catalog in DEFAULT_CATALOG_URLS in parallel.
 * Failed catalogs are logged as warnings but don't break the store.
 * Earlier catalogs take precedence if plugin IDs conflict.
 *
 * @returns Merged list of catalog plugins from all available catalogs
 */
export async function fetchAllCatalogPlugins(): Promise<CatalogPlugin[]> {
  const pluginMap = new Map<string, CatalogPlugin>();

  const results = await Promise.allSettled(
    DEFAULT_CATALOG_URLS.map((url) => fetchCatalogPlugins(url)),
  );

  // process in reverse order so earlier catalogs override later ones
  for (let i = results.length - 1; i >= 0; i--) {
    const result = results[i];
    const _catalogUrl = DEFAULT_CATALOG_URLS[i];

    if (result.status === "rejected") {
      continue;
    }

    for (const plugin of result.value) {
      pluginMap.set(plugin.id, plugin);
    }
  }

  return Array.from(pluginMap.values());
}

/**
 * Fetch the plugin catalog from a GitHub repository.
 *
 * The catalog is a JSON file (plugins.json) containing a list of plugin entries
 * with repository URLs and trust levels.
 *
 * @param catalogUrl - GitHub URL to the catalog repository
 * @returns List of catalog plugins with full metadata
 */
export async function fetchCatalogPlugins(
  catalogUrl: string,
): Promise<CatalogPlugin[]> {
  const octokit = createOctokit();
  const { owner, repo } = parseGitHubUrl(catalogUrl);

  // fetch catalog.json from the catalog repo root
  const { data } = await octokit.repos.getContent({
    owner,
    repo,
    path: "catalog.json",
    mediaType: { format: "raw" },
  });

  // handle content response
  if (typeof data !== "string") {
    throw new Error("Expected raw content from catalog.json");
  }

  const catalog: CatalogFile = JSON.parse(data);
  const plugins: CatalogPlugin[] = [];

  // fetch manifest for each plugin in parallel (with concurrency limit)
  const results = await Promise.allSettled(
    catalog.plugins.map(async (entry) => {
      try {
        const manifest = await fetchPluginManifest(entry.repository);
        // trust level comes from internal registry, NOT from catalog
        const trustLevel = getTrustLevel(manifest.id);
        return {
          id: entry.id,
          name: manifest.name,
          description: manifest.description ?? entry.description ?? "",
          repositoryUrl: entry.repository,
          author: manifest.author ?? entry.author ?? "Unknown",
          version: manifest.version,
          trustLevel,
          category: entry.category ?? "other",
          keywords: entry.keywords ?? [],
          screenshots: entry.screenshots ?? [],
          minInboxZeroVersion: manifest.inboxZero?.minVersion,
        } satisfies CatalogPlugin;
      } catch {
        // silently skip plugins that fail to load - catalog remains available
        return null;
      }
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      plugins.push(result.value);
    }
  }

  return plugins;
}

// -----------------------------------------------------------------------------
// Plugin Manifest Fetching
// -----------------------------------------------------------------------------

/**
 * Fetch the plugin manifest (plugin.json) from a GitHub repository.
 *
 * @param repositoryUrl - GitHub repository URL
 * @param ref - Git ref (branch, tag, or commit SHA). Defaults to default branch.
 * @returns Parsed and validated plugin manifest
 */
export async function fetchPluginManifest(
  repositoryUrl: string,
  ref?: string,
): Promise<PluginManifest> {
  const octokit = createOctokit();
  const { owner, repo } = parseGitHubUrl(repositoryUrl);

  // if no ref provided, get default branch
  const targetRef = ref ?? (await getDefaultBranch(repositoryUrl));

  const { data } = await octokit.repos.getContent({
    owner,
    repo,
    path: "plugin.json",
    ref: targetRef,
    mediaType: { format: "raw" },
  });

  if (typeof data !== "string") {
    throw new Error("Expected raw content from plugin.json");
  }

  const parsed = JSON.parse(data);
  const result = safeParsePluginManifest(parsed);

  if (!result.success) {
    throw new Error(`Invalid plugin.json: ${result.error.message}`);
  }

  return result.data;
}

// -----------------------------------------------------------------------------
// Version Fetching
// -----------------------------------------------------------------------------

/**
 * Fetch available versions for a plugin from GitHub releases.
 *
 * Returns the last 5 releases plus the default branch as a development option.
 * This follows the HACS-style version selection pattern.
 *
 * @param repositoryUrl - GitHub repository URL
 * @returns List of available versions (releases + default branch)
 */
export async function fetchPluginVersions(
  repositoryUrl: string,
): Promise<PluginVersion[]> {
  const versions: PluginVersion[] = [];

  // fetch releases
  const releases = await fetchGitHubReleases(repositoryUrl);
  versions.push(...releases);

  // add default branch as development option
  const defaultBranch = await getDefaultBranch(repositoryUrl);
  const latestCommit = await getLatestCommit(repositoryUrl, defaultBranch);

  versions.push({
    version: defaultBranch,
    type: "branch",
    commitSha: latestCommit.slice(0, 7),
    prerelease: true, // branches are always considered prerelease
  });

  return versions;
}

/**
 * Fetch the last 5 GitHub releases for a repository.
 *
 * Only formal GitHub Releases are returned (not just git tags).
 * Each release is enriched with the minInboxZeroVersion from the plugin.json
 * at that release tag.
 *
 * @param repositoryUrl - GitHub repository URL
 * @returns List of plugin versions from releases
 */
async function fetchGitHubReleases(
  repositoryUrl: string,
): Promise<PluginVersion[]> {
  const octokit = createOctokit();
  const { owner, repo } = parseGitHubUrl(repositoryUrl);

  const releases = await octokit.repos.listReleases({
    owner,
    repo,
    per_page: 5,
  });

  const versions: PluginVersion[] = [];

  // fetch plugin.json for each release to get minVersion
  const results = await Promise.allSettled(
    releases.data.map(async (release) => {
      let minInboxZeroVersion: string | undefined;

      try {
        const manifest = await fetchPluginManifest(
          repositoryUrl,
          release.tag_name,
        );
        minInboxZeroVersion = manifest.inboxZero?.minVersion;
      } catch {
        // ignore - manifest might not exist at this tag
      }

      return {
        version: release.tag_name.replace(/^v/, ""),
        type: "release" as const,
        tag: release.tag_name,
        releasedAt: release.published_at
          ? new Date(release.published_at)
          : undefined,
        releaseNotes: release.body ?? undefined,
        prerelease: release.prerelease,
        minInboxZeroVersion,
      };
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      versions.push(result.value);
    }
  }

  return versions;
}

// -----------------------------------------------------------------------------
// Repository Helpers
// -----------------------------------------------------------------------------

/**
 * Get the default branch for a repository.
 */
export async function getDefaultBranch(repositoryUrl: string): Promise<string> {
  const octokit = createOctokit();
  const { owner, repo } = parseGitHubUrl(repositoryUrl);

  const { data } = await octokit.repos.get({ owner, repo });
  return data.default_branch;
}

/**
 * Get the latest commit SHA for a branch.
 */
export async function getLatestCommit(
  repositoryUrl: string,
  branch: string,
): Promise<string> {
  const octokit = createOctokit();
  const { owner, repo } = parseGitHubUrl(repositoryUrl);

  const { data } = await octokit.repos.getBranch({ owner, repo, branch });
  return data.commit.sha;
}

/**
 * Get the tarball URL for downloading a repository at a specific ref.
 */
export function getTarballUrl(repositoryUrl: string, ref: string): string {
  const { owner, repo } = parseGitHubUrl(repositoryUrl);
  return `https://api.github.com/repos/${owner}/${repo}/tarball/${ref}`;
}

/**
 * Validates that a repository has at least one GitHub Release.
 * This is a requirement for plugin catalog submission.
 */
export async function hasGitHubRelease(
  repositoryUrl: string,
): Promise<boolean> {
  const octokit = createOctokit();
  const { owner, repo } = parseGitHubUrl(repositoryUrl);

  const { data } = await octokit.repos.listReleases({
    owner,
    repo,
    per_page: 1,
  });

  return data.length > 0;
}

/**
 * Check if a repository has the required topic for catalog discovery.
 */
export async function hasPluginTopic(repositoryUrl: string): Promise<boolean> {
  const octokit = createOctokit();
  const { owner, repo } = parseGitHubUrl(repositoryUrl);

  const { data } = await octokit.repos.getAllTopics({ owner, repo });
  return data.names.includes("inbox-zero-plugin");
}

// expose for testing
export { parseGitHubUrl };
