export const prefixPath = (emailAccountId: string, path: `/${string}`) => {
  if (emailAccountId) return `/${emailAccountId}${path}`;
  return path;
};

export function isInternalPath(path: string | null | undefined): boolean {
  if (!path) return false;
  return path.startsWith("/") && !path.startsWith("//");
}
