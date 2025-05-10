import { describe, it, expect, vi, afterEach } from "vitest";

// Define constants at the top level
const adminEmail = "admin@example.com";
const nonAdminEmail = "user@example.com";
const anotherAdmin = "another@admin.com";
const defaultAdmins = `${adminEmail},${anotherAdmin}`;

// Mock the structure. The actual value will be set per test using vi.doMock.
// The initial value here might be used if a test doesn't use vi.doMock,
// but it's safer to use vi.doMock in each test for clarity.
vi.mock("@/env", () => ({
  env: {
    ADMINS: defaultAdmins,
  },
}));

describe("isAdmin", () => {
  afterEach(() => {
    // Reset modules ensures that dynamic imports get a fresh version
    // linked to the mocks set by vi.doMock in the next test.
    vi.resetModules();
  });

  it("should return true if the email is in ADMINS", async () => {
    // Establish mock state for this test
    await vi.doMock("@/env", () => ({ env: { ADMINS: defaultAdmins } }));
    // Dynamically import the module *after* mocking
    const { isAdmin } = await import("./admin");
    expect(isAdmin({ email: adminEmail })).toBe(true);
  });

  it("should return false if the email is not in ADMINS", async () => {
    await vi.doMock("@/env", () => ({ env: { ADMINS: defaultAdmins } }));
    const { isAdmin } = await import("./admin");
    expect(isAdmin({ email: nonAdminEmail })).toBe(false);
  });

  it("should return false if the email is null", async () => {
    await vi.doMock("@/env", () => ({ env: { ADMINS: defaultAdmins } }));
    const { isAdmin } = await import("./admin");
    expect(isAdmin({ email: null })).toBe(false);
  });

  it("should return false if the email is undefined", async () => {
    await vi.doMock("@/env", () => ({ env: { ADMINS: defaultAdmins } }));
    const { isAdmin } = await import("./admin");
    expect(isAdmin({ email: undefined })).toBe(false);
  });

  it("should be case-sensitive and return false if casing differs", async () => {
    await vi.doMock("@/env", () => ({ env: { ADMINS: defaultAdmins } }));
    const { isAdmin } = await import("./admin");
    // String.includes is case-sensitive. "Admin@example.com" is not in "admin@example.com,..."
    expect(isAdmin({ email: "Admin@example.com" })).toBe(false);
  });

  it("should return true if casing matches exactly in ADMINS", async () => {
    await vi.doMock("@/env", () => ({
      env: { ADMINS: `Admin@example.com,${anotherAdmin}` },
    }));
    const { isAdmin } = await import("./admin");
    expect(isAdmin({ email: "Admin@example.com" })).toBe(true);
  });

  it("should return false if ADMINS env var is not set (undefined)", async () => {
    await vi.doMock("@/env", () => ({ env: { ADMINS: undefined } }));
    const { isAdmin } = await import("./admin");
    expect(isAdmin({ email: adminEmail })).toBeFalsy();
  });

  it("should return false if ADMINS env var is empty", async () => {
    await vi.doMock("@/env", () => ({ env: { ADMINS: "" } }));
    const { isAdmin } = await import("./admin");
    expect(isAdmin({ email: adminEmail })).toBe(false);
  });

  it("should handle spaces around emails in ADMINS env var", async () => {
    // Testing current behavior: String.includes finds substrings
    await vi.doMock("@/env", () => ({
      env: { ADMINS: ` ${adminEmail} , ${anotherAdmin} ` },
    }));
    const { isAdmin } = await import("./admin");
    // " ${adminEmail} , ...".includes(adminEmail) is true
    expect(isAdmin({ email: adminEmail })).toBe(true);
  });

  it("should handle email match when ADMINS list has extra spaces", async () => {
    await vi.doMock("@/env", () => ({
      env: { ADMINS: `   ${adminEmail}    ,    ${anotherAdmin}   ` },
    }));
    const { isAdmin } = await import("./admin");
    // "   ${adminEmail}    , ...".includes(adminEmail) is true
    expect(isAdmin({ email: adminEmail })).toBe(true);
  });
});
