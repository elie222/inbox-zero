import { normalizeInternalPath } from "@/utils/path";

export function buildRedirectUrl(
  basePath: string,
  searchParams?: Record<string, string | string[] | undefined>,
): string {
  if (!searchParams) return basePath;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function buildLoginRedirectUrl(nextPath: string | null | undefined) {
  const normalizedNextPath = normalizeInternalPath(nextPath);
  if (!normalizedNextPath) return "/login";

  return buildRedirectUrl("/login", { next: normalizedNextPath });
}
