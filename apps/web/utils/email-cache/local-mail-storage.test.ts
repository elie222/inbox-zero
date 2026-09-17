import { describe, expect, it } from "vitest";
import { evaluateLocalMailStorageAdmission } from "./local-mail-storage";

const MIB = 1024 * 1024;

describe("local mail storage admission", () => {
  it("exposes the reserved limit even when usage already exceeds it", () => {
    expect(
      evaluateLocalMailStorageAdmission({
        desktop: false,
        estimate: { usage: 600 * MIB, quota: 10_000 * MIB },
        purpose: "current",
      }),
    ).toMatchObject({ limitBytes: 475 * MIB, remainingBytes: 0 });
    expect(evaluateLocalMailStorageAdmission({ desktop: false })).toMatchObject(
      { limitBytes: 0, remainingBytes: 0 },
    );
  });
  it("reserves incoming capacity and includes anticipated index growth", () => {
    const result = evaluateLocalMailStorageAdmission({
      desktop: false,
      estimate: { usage: 440 * MIB, quota: 10_000 * MIB },
      expectedGrowthBytes: 16 * MIB,
    });
    expect(result).toMatchObject({ allowed: false, reason: "storage-full" });
    expect(result.remainingBytes).toBe(10 * MIB);
  });

  it("admits incoming mail after history stops while preserving protected work space", () => {
    const options = {
      desktop: false,
      estimate: { usage: 450 * MIB, quota: 10_000 * MIB },
      expectedGrowthBytes: 16 * MIB,
    };
    expect(evaluateLocalMailStorageAdmission(options).allowed).toBe(false);
    expect(
      evaluateLocalMailStorageAdmission({ ...options, purpose: "current" }),
    ).toMatchObject({ allowed: true, remainingBytes: 25 * MIB });
    expect(
      evaluateLocalMailStorageAdmission({
        ...options,
        purpose: "current",
        expectedGrowthBytes: 26 * MIB,
      }).allowed,
    ).toBe(false);
  });

  it("clamps incoming allowance to quota and preserves reserve in small budgets", () => {
    for (const options of [
      { budgetBytes: 100 * MIB, quota: 10_000 * MIB },
      { budgetBytes: 500 * MIB, quota: 125 * MIB },
    ]) {
      expect(
        evaluateLocalMailStorageAdmission({
          desktop: false,
          purpose: "current",
          budgetBytes: options.budgetBytes,
          estimate: { usage: 80 * MIB, quota: options.quota },
          expectedGrowthBytes: 5 * MIB,
        }),
      ).toMatchObject({ allowed: false, remainingBytes: 4 * MIB });
    }
  });

  it("allows larger desktop retention but still clamps to origin quota", () => {
    const roomy = { usage: 600 * MIB, quota: 10_000 * MIB };
    expect(
      evaluateLocalMailStorageAdmission({ desktop: true, estimate: roomy })
        .allowed,
    ).toBe(true);
    expect(
      evaluateLocalMailStorageAdmission({ desktop: false, estimate: roomy })
        .allowed,
    ).toBe(false);
    expect(
      evaluateLocalMailStorageAdmission({
        desktop: true,
        estimate: { ...roomy, quota: 800 * MIB },
      }).allowed,
    ).toBe(false);
  });

  it.each([
    undefined,
    {},
    { usage: 0 },
    { usage: -1, quota: 100 },
    { usage: 0, quota: Number.NaN },
  ])("does not backfill without a usable storage measurement: %j", (estimate) => {
    expect(
      evaluateLocalMailStorageAdmission({ desktop: false, estimate }),
    ).toMatchObject({
      allowed: false,
      reason: "storage-unavailable",
      remainingBytes: 0,
    });
  });

  it("honors a smaller configured budget without consuming its reserve", () => {
    expect(
      evaluateLocalMailStorageAdmission({
        desktop: true,
        budgetBytes: 100 * MIB,
        estimate: { usage: 55 * MIB, quota: 10_000 * MIB },
      }),
    ).toMatchObject({ allowed: false, remainingBytes: 13 * MIB });
  });

  it("rejects invalid settings instead of bypassing admission", () => {
    expect(() =>
      evaluateLocalMailStorageAdmission({
        desktop: false,
        budgetBytes: Number.POSITIVE_INFINITY,
      }),
    ).toThrow();
    expect(() =>
      evaluateLocalMailStorageAdmission({
        desktop: false,
        expectedGrowthBytes: -1,
      }),
    ).toThrow();
  });
});
