export function isPrereleaseDesktopVersion(version: string): boolean {
  return version.includes("-");
}

export function compareDesktopVersions(a: string, b: string): number {
  const left = parseDesktopVersion(a);
  const right = parseDesktopVersion(b);
  const length = Math.max(left.core.length, right.core.length);
  for (let index = 0; index < length; index++) {
    const delta = (left.core[index] ?? 0) - (right.core[index] ?? 0);
    if (delta > 0) return 1;
    if (delta < 0) return -1;
  }
  if (left.prerelease === right.prerelease) return 0;
  return left.prerelease ? -1 : 1;
}

function parseDesktopVersion(version: string): {
  core: number[];
  prerelease: boolean;
} {
  const prerelease = isPrereleaseDesktopVersion(version);
  const coreText = version.split("-")[0] ?? version;
  return {
    core: coreText.split(".").map((part) => Number.parseInt(part, 10) || 0),
    prerelease,
  };
}
