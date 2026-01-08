import { describe, it, expect } from "vitest";
import {
  parseSimplifiedCron,
  isValidCronExpression,
  getCronIntervalMinutes,
  roundToMinInterval,
  validateAndNormalizeCron,
} from "./cron";
import { CRON_MIN_INTERVAL_MINUTES } from "./constants";

describe("plugin-runtime/cron", () => {
  describe("parseSimplifiedCron", () => {
    describe("@every Nm (minutes)", () => {
      it("converts @every 5m to */5 * * * *", () => {
        expect(parseSimplifiedCron("@every 5m")).toBe("*/5 * * * *");
      });

      it("converts @every 1m to */1 * * * *", () => {
        expect(parseSimplifiedCron("@every 1m")).toBe("*/1 * * * *");
      });

      it("converts @every 30m to */30 * * * *", () => {
        expect(parseSimplifiedCron("@every 30m")).toBe("*/30 * * * *");
      });

      it("handles whitespace in @every Nm", () => {
        expect(parseSimplifiedCron("  @every   15m  ")).toBe("*/15 * * * *");
      });

      it("is case-insensitive", () => {
        expect(parseSimplifiedCron("@EVERY 10M")).toBe("*/10 * * * *");
      });

      it("throws for 0 minute interval", () => {
        expect(() => parseSimplifiedCron("@every 0m")).toThrow(
          "must be greater than 0",
        );
      });

      it("throws for negative minute interval (unrecognized syntax)", () => {
        expect(() => parseSimplifiedCron("@every -5m")).toThrow(
          "Unknown simplified cron syntax",
        );
      });

      it("throws for interval > 59 minutes", () => {
        expect(() => parseSimplifiedCron("@every 60m")).toThrow(
          "cannot exceed 59",
        );
      });
    });

    describe("@every Nh (hours)", () => {
      it("converts @every 1h to 0 */1 * * *", () => {
        expect(parseSimplifiedCron("@every 1h")).toBe("0 */1 * * *");
      });

      it("converts @every 6h to 0 */6 * * *", () => {
        expect(parseSimplifiedCron("@every 6h")).toBe("0 */6 * * *");
      });

      it("converts @every 12h to 0 */12 * * *", () => {
        expect(parseSimplifiedCron("@every 12h")).toBe("0 */12 * * *");
      });

      it("throws for 0 hour interval", () => {
        expect(() => parseSimplifiedCron("@every 0h")).toThrow(
          "must be greater than 0",
        );
      });

      it("throws for interval > 23 hours", () => {
        expect(() => parseSimplifiedCron("@every 24h")).toThrow(
          "cannot exceed 23",
        );
      });
    });

    describe("@daily", () => {
      it("converts @daily to 0 0 * * *", () => {
        expect(parseSimplifiedCron("@daily")).toBe("0 0 * * *");
      });

      it("handles whitespace", () => {
        expect(parseSimplifiedCron("  @daily  ")).toBe("0 0 * * *");
      });

      it("is case-insensitive", () => {
        expect(parseSimplifiedCron("@DAILY")).toBe("0 0 * * *");
      });
    });

    describe("@weekly", () => {
      it("converts @weekly to 0 0 * * 0", () => {
        expect(parseSimplifiedCron("@weekly")).toBe("0 0 * * 0");
      });

      it("is case-insensitive", () => {
        expect(parseSimplifiedCron("@Weekly")).toBe("0 0 * * 0");
      });
    });

    describe("@hourly", () => {
      it("converts @hourly to 0 * * * *", () => {
        expect(parseSimplifiedCron("@hourly")).toBe("0 * * * *");
      });

      it("is case-insensitive", () => {
        expect(parseSimplifiedCron("@HOURLY")).toBe("0 * * * *");
      });
    });

    describe("standard cron passthrough", () => {
      it("returns standard cron expressions unchanged", () => {
        expect(parseSimplifiedCron("0 7 * * *")).toBe("0 7 * * *");
      });

      it("returns complex cron expressions unchanged", () => {
        expect(parseSimplifiedCron("*/15 9-17 * * 1-5")).toBe(
          "*/15 9-17 * * 1-5",
        );
      });
    });

    describe("unknown @ syntax", () => {
      it("throws for unknown @ prefix", () => {
        expect(() => parseSimplifiedCron("@unknown")).toThrow(
          "Unknown simplified cron syntax",
        );
      });

      it("throws for @monthly (not supported)", () => {
        expect(() => parseSimplifiedCron("@monthly")).toThrow(
          "Unknown simplified cron syntax",
        );
      });
    });
  });

  describe("isValidCronExpression", () => {
    describe("valid expressions", () => {
      it("validates simple wildcard expression", () => {
        expect(isValidCronExpression("* * * * *")).toBe(true);
      });

      it("validates specific time", () => {
        expect(isValidCronExpression("0 7 * * *")).toBe(true);
      });

      it("validates step patterns", () => {
        expect(isValidCronExpression("*/5 * * * *")).toBe(true);
        expect(isValidCronExpression("0 */2 * * *")).toBe(true);
      });

      it("validates range patterns", () => {
        expect(isValidCronExpression("0 9-17 * * *")).toBe(true);
        expect(isValidCronExpression("0 0 * * 1-5")).toBe(true);
      });

      it("validates list patterns", () => {
        expect(isValidCronExpression("0 0,12 * * *")).toBe(true);
        expect(isValidCronExpression("0 0 1,15 * *")).toBe(true);
      });

      it("validates complex expressions", () => {
        expect(isValidCronExpression("*/15 9-17 * * 1-5")).toBe(true);
        expect(isValidCronExpression("0 0 1,15 1-6 *")).toBe(true);
      });

      it("validates day of week 7 (Sunday)", () => {
        expect(isValidCronExpression("0 0 * * 7")).toBe(true);
      });

      it("validates simplified syntax", () => {
        expect(isValidCronExpression("@daily")).toBe(true);
        expect(isValidCronExpression("@every 5m")).toBe(true);
        expect(isValidCronExpression("@hourly")).toBe(true);
      });
    });

    describe("invalid expressions", () => {
      it("rejects empty string", () => {
        expect(isValidCronExpression("")).toBe(false);
      });

      it("rejects null/undefined", () => {
        expect(isValidCronExpression(null as unknown as string)).toBe(false);
        expect(isValidCronExpression(undefined as unknown as string)).toBe(
          false,
        );
      });

      it("rejects wrong number of fields", () => {
        expect(isValidCronExpression("* * * *")).toBe(false);
        expect(isValidCronExpression("* * * * * *")).toBe(false);
      });

      it("rejects out of range minute", () => {
        expect(isValidCronExpression("60 * * * *")).toBe(false);
        expect(isValidCronExpression("-1 * * * *")).toBe(false);
      });

      it("rejects out of range hour", () => {
        expect(isValidCronExpression("0 24 * * *")).toBe(false);
      });

      it("rejects out of range day of month", () => {
        expect(isValidCronExpression("0 0 32 * *")).toBe(false);
        expect(isValidCronExpression("0 0 0 * *")).toBe(false);
      });

      it("rejects out of range month", () => {
        expect(isValidCronExpression("0 0 * 13 *")).toBe(false);
        expect(isValidCronExpression("0 0 * 0 *")).toBe(false);
      });

      it("rejects out of range day of week", () => {
        expect(isValidCronExpression("0 0 * * 8")).toBe(false);
      });

      it("rejects invalid simplified syntax", () => {
        expect(isValidCronExpression("@every 0m")).toBe(false);
        expect(isValidCronExpression("@unknown")).toBe(false);
      });

      it("rejects expressions exceeding max length", () => {
        const longCron = "* ".repeat(100);
        expect(isValidCronExpression(longCron)).toBe(false);
      });

      it("rejects invalid step values", () => {
        expect(isValidCronExpression("*/0 * * * *")).toBe(false);
        expect(isValidCronExpression("*/-1 * * * *")).toBe(false);
      });

      it("rejects invalid range (start > end)", () => {
        expect(isValidCronExpression("0 17-9 * * *")).toBe(false);
      });
    });
  });

  describe("getCronIntervalMinutes", () => {
    describe("minute intervals", () => {
      it("returns 5 for */5 * * * *", () => {
        expect(getCronIntervalMinutes("*/5 * * * *")).toBe(5);
      });

      it("returns 1 for */1 * * * *", () => {
        expect(getCronIntervalMinutes("*/1 * * * *")).toBe(1);
      });

      it("returns 30 for */30 * * * *", () => {
        expect(getCronIntervalMinutes("*/30 * * * *")).toBe(30);
      });
    });

    describe("hourly intervals", () => {
      it("returns 60 for 0 * * * *", () => {
        expect(getCronIntervalMinutes("0 * * * *")).toBe(60);
      });

      it("returns 120 for 0 */2 * * *", () => {
        expect(getCronIntervalMinutes("0 */2 * * *")).toBe(120);
      });

      it("returns 360 for 0 */6 * * *", () => {
        expect(getCronIntervalMinutes("0 */6 * * *")).toBe(360);
      });
    });

    describe("daily intervals", () => {
      it("returns 1440 for 0 0 * * *", () => {
        expect(getCronIntervalMinutes("0 0 * * *")).toBe(1440);
      });

      it("returns 1440 for specific hour", () => {
        expect(getCronIntervalMinutes("0 7 * * *")).toBe(1440);
      });
    });

    describe("weekly intervals", () => {
      it("returns 10080 for 0 0 * * 0", () => {
        expect(getCronIntervalMinutes("0 0 * * 0")).toBe(10_080);
      });

      it("returns 10080 for specific day of week", () => {
        expect(getCronIntervalMinutes("0 7 * * 1")).toBe(10_080);
      });
    });

    describe("simplified syntax", () => {
      it("returns 5 for @every 5m", () => {
        expect(getCronIntervalMinutes("@every 5m")).toBe(5);
      });

      it("returns 120 for @every 2h", () => {
        expect(getCronIntervalMinutes("@every 2h")).toBe(120);
      });

      it("returns 1440 for @daily", () => {
        expect(getCronIntervalMinutes("@daily")).toBe(1440);
      });

      it("returns 10080 for @weekly", () => {
        expect(getCronIntervalMinutes("@weekly")).toBe(10_080);
      });

      it("returns 60 for @hourly", () => {
        expect(getCronIntervalMinutes("@hourly")).toBe(60);
      });
    });

    describe("edge cases", () => {
      it("returns 0 for invalid expression", () => {
        expect(getCronIntervalMinutes("invalid")).toBe(0);
      });

      it("returns 0 for empty string", () => {
        expect(getCronIntervalMinutes("")).toBe(0);
      });

      it("returns 0 for unknown @ syntax", () => {
        expect(getCronIntervalMinutes("@unknown")).toBe(0);
      });
    });
  });

  describe("roundToMinInterval", () => {
    it("returns minimum interval for values below minimum", () => {
      expect(roundToMinInterval(0)).toBe(CRON_MIN_INTERVAL_MINUTES);
      expect(roundToMinInterval(0.5)).toBe(CRON_MIN_INTERVAL_MINUTES);
    });

    it("returns same value for values at or above minimum", () => {
      expect(roundToMinInterval(CRON_MIN_INTERVAL_MINUTES)).toBe(
        CRON_MIN_INTERVAL_MINUTES,
      );
      expect(roundToMinInterval(5)).toBe(5);
      expect(roundToMinInterval(60)).toBe(60);
    });
  });

  describe("validateAndNormalizeCron", () => {
    describe("valid simplified expressions", () => {
      it("normalizes @every 5m", () => {
        const result = validateAndNormalizeCron("@every 5m");
        expect(result).toEqual({
          valid: true,
          normalized: "*/5 * * * *",
          effectiveIntervalMinutes: 5,
        });
      });

      it("normalizes @daily", () => {
        const result = validateAndNormalizeCron("@daily");
        expect(result).toEqual({
          valid: true,
          normalized: "0 0 * * *",
          effectiveIntervalMinutes: 1440,
        });
      });

      it("normalizes @weekly", () => {
        const result = validateAndNormalizeCron("@weekly");
        expect(result).toEqual({
          valid: true,
          normalized: "0 0 * * 0",
          effectiveIntervalMinutes: 10_080,
        });
      });

      it("normalizes @hourly", () => {
        const result = validateAndNormalizeCron("@hourly");
        expect(result).toEqual({
          valid: true,
          normalized: "0 * * * *",
          effectiveIntervalMinutes: 60,
        });
      });

      it("normalizes @every 2h", () => {
        const result = validateAndNormalizeCron("@every 2h");
        expect(result).toEqual({
          valid: true,
          normalized: "0 */2 * * *",
          effectiveIntervalMinutes: 120,
        });
      });
    });

    describe("valid standard expressions", () => {
      it("validates standard cron expression", () => {
        const result = validateAndNormalizeCron("0 7 * * *");
        expect(result).toEqual({
          valid: true,
          normalized: "0 7 * * *",
          effectiveIntervalMinutes: 1440,
        });
      });

      it("validates complex cron expression", () => {
        const result = validateAndNormalizeCron("*/15 9-17 * * 1-5");
        expect(result.valid).toBe(true);
        expect(result.normalized).toBe("*/15 9-17 * * 1-5");
      });
    });

    describe("invalid expressions", () => {
      it("rejects empty string", () => {
        const result = validateAndNormalizeCron("");
        expect(result.valid).toBe(false);
        expect(result.error).toBe("Cron expression is required");
      });

      it("rejects invalid simplified syntax", () => {
        const result = validateAndNormalizeCron("@every 0m");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("must be greater than 0");
      });

      it("rejects unknown @ syntax", () => {
        const result = validateAndNormalizeCron("@unknown");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Unknown simplified cron syntax");
      });

      it("rejects invalid standard expression", () => {
        const result = validateAndNormalizeCron("invalid cron");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Invalid cron expression format");
      });

      it("rejects too long expression", () => {
        const result = validateAndNormalizeCron("* ".repeat(100));
        expect(result.valid).toBe(false);
        expect(result.error).toContain("exceeds maximum length");
      });

      it("rejects null", () => {
        const result = validateAndNormalizeCron(null as unknown as string);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("Cron expression is required");
      });
    });

    describe("whitespace handling", () => {
      it("trims whitespace", () => {
        const result = validateAndNormalizeCron("  @daily  ");
        expect(result.valid).toBe(true);
        expect(result.normalized).toBe("0 0 * * *");
      });

      it("handles multiple spaces between fields", () => {
        const result = validateAndNormalizeCron("0  7  *  *  *");
        expect(result.valid).toBe(true);
      });
    });
  });
});
