import { describe, expect, it } from "vitest";
import { claimStaleDeploymentReload } from "./stale-deployment";

describe("claimStaleDeploymentReload", () => {
  it("reloads once and not again while the reloaded page is still stale", () => {
    const storage = createStorage();
    const deployNoticedAt = 1_000_000;

    expect(claimStaleDeploymentReload(storage, deployNoticedAt)).toBe(true);
    expect(claimStaleDeploymentReload(storage, deployNoticedAt + 2000)).toBe(
      false,
    );
    expect(
      claimStaleDeploymentReload(storage, deployNoticedAt + 4 * 60 * 1000),
    ).toBe(false);
  });

  it("reloads again for a later deploy once the cooldown has passed", () => {
    const storage = createStorage();
    const firstDeployAt = 1_000_000;

    claimStaleDeploymentReload(storage, firstDeployAt);

    expect(
      claimStaleDeploymentReload(storage, firstDeployAt + 24 * 60 * 60 * 1000),
    ).toBe(true);
  });
});

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
