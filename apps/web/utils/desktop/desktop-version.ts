export function isPrereleaseDesktopVersion(version: string): boolean {
  return parseDesktopVersion(version).prerelease !== null;
}

export function compareDesktopVersions(a: string, b: string): number {
  const left = parseDesktopVersion(a);
  const right = parseDesktopVersion(b);
  const coreLength = Math.max(left.core.length, right.core.length);
  for (let index = 0; index < coreLength; index++) {
    const delta = (left.core[index] ?? 0) - (right.core[index] ?? 0);
    if (delta > 0) return 1;
    if (delta < 0) return -1;
  }
  if (left.prerelease === null && right.prerelease === null) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return comparePrereleaseIdentifiers(left.prerelease, right.prerelease);
}

function parseDesktopVersion(version: string): {
  core: number[];
  prerelease: string[] | null;
} {
  const withoutBuild = (version.split("+")[0] ?? version).trim();
  const dash = withoutBuild.indexOf("-");
  const coreText = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash);
  return {
    core: coreText.split(".").map((part) => Number.parseInt(part, 10) || 0),
    prerelease: dash === -1 ? null : withoutBuild.slice(dash + 1).split("."),
  };
}

function comparePrereleaseIdentifiers(left: string[], right: string[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++) {
    const a = left[index];
    const b = right[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    const aNum = numericIdentifier(a);
    const bNum = numericIdentifier(b);
    if (aNum !== null && bNum !== null) {
      if (aNum > bNum) return 1;
      if (aNum < bNum) return -1;
      continue;
    }
    if (aNum !== null) return -1;
    if (bNum !== null) return 1;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

function numericIdentifier(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  return Number.parseInt(value, 10);
}
