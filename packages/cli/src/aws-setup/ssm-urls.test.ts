import { describe, expect, it } from "vitest";
import { buildDatabaseUrl } from "./ssm-urls";

describe("RDS database URL", () => {
  it("requires verified TLS and preserves escaped credentials", () => {
    const url = new URL(
      buildDatabaseUrl({
        username: "user@example",
        password: "p@ss:/#",
        endpoint: "database.example.rds.amazonaws.com",
        port: 5432,
        database: "inboxzero",
      }),
    );
    expect(url.searchParams.get("sslmode")).toBe("verify-full");
    expect(decodeURIComponent(url.username)).toBe("user@example");
    expect(decodeURIComponent(url.password)).toBe("p@ss:/#");
  });
});
