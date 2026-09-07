export function expandPlaywrightTargets(
  paths: readonly string[],
  appRoot: string,
): Array<{ name: string; path: string }>;

export function getPlaywrightTargetName(specPath: string): string;

export function getPlaywrightSpecPathFromTargetName(targetName: string): string;

export function batchPlaywrightTargets(
  targets: ReadonlyArray<{ name: string; path: string }>,
): Array<{ name: string; paths: string[] }>;
