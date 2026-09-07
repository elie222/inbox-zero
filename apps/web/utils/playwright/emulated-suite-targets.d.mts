export function expandPlaywrightTargets(
  paths: readonly string[],
  appRoot: string,
): Array<{ name: string; path: string }>;

export function getPlaywrightTargetName(specPath: string): string;

export function getPlaywrightSpecPathFromTargetName(targetName: string): string;
