export const prefixPath = (emailAccountId: string, path: `/${string}`) => {
  if (emailAccountId) return `/${emailAccountId}${path}`;
  return path;
};

const INTERNAL_PATH_ORIGIN = "https://internal-path.example";

export function normalizeInternalPath(
  path: string | null | undefined,
): string | null {
  if (!path?.startsWith("/")) return null;
  if (hasDisallowedPathCharacter(path)) return null;

  try {
    const url = new URL(path, INTERNAL_PATH_ORIGIN);
    if (url.origin !== INTERNAL_PATH_ORIGIN) return null;

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function isInternalPath(path: string | null | undefined): boolean {
  return !!normalizeInternalPath(path);
}

function hasDisallowedPathCharacter(path: string): boolean {
  for (const char of path) {
    if (char === "\\") return true;

    const codePoint = char.charCodeAt(0);
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }

  return false;
}
