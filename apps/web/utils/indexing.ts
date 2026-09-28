/**
 * Staging is a production-target Vercel project, so VERCEL_ENV alone does not
 * exclude it. Self-hosted installs stay indexable.
 */
export function isIndexingAllowed(
  baseUrl: string,
  vercelEnv = process.env.VERCEL_ENV,
): boolean {
  if (vercelEnv === "preview") return false;

  try {
    return !new URL(baseUrl).hostname.toLowerCase().startsWith("staging.");
  } catch {
    return true;
  }
}
