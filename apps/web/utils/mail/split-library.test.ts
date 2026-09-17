import { describe, expect, it } from "vitest";
import { MailSplitFilterKind, SystemType } from "@/generated/prisma/enums";
import {
  availableLibraryFilters,
  resolveLibraryEntry,
  SPLIT_LIBRARY,
} from "@/utils/mail/split-library";

const otpEntry = SPLIT_LIBRARY.find((entry) => entry.name === "OTP");
const toReplyEntry = SPLIT_LIBRARY.find((entry) => entry.name === "To reply");

describe("availableLibraryFilters", () => {
  it("hides label-backed splits when the account has no matching label", () => {
    expect(toReplyEntry).toBeDefined();
    expect(
      resolveLibraryEntry(toReplyEntry!, {
        labelsByName: new Map(),
        categoriesByName: new Map(),
      }),
    ).toBeNull();
    expect(
      availableLibraryFilters(toReplyEntry!, {
        labelsByName: new Map(),
        categoriesByName: new Map(),
      }),
    ).toBeNull();
  });

  it("still offers OTP before the label exists so the library can create the rule", () => {
    expect(otpEntry?.createsSystemType).toBe(SystemType.OTP);
    expect(
      resolveLibraryEntry(otpEntry!, {
        labelsByName: new Map(),
        categoriesByName: new Map(),
      }),
    ).toBeNull();
    expect(
      availableLibraryFilters(otpEntry!, {
        labelsByName: new Map(),
        categoriesByName: new Map(),
      }),
    ).toEqual([]);
  });

  it("resolves OTP to the label filter once the label exists", () => {
    expect(otpEntry).toBeDefined();
    expect(
      availableLibraryFilters(otpEntry!, {
        labelsByName: new Map([["otp", "otp-label-id"]]),
        categoriesByName: new Map(),
      }),
    ).toEqual([{ kind: MailSplitFilterKind.LABEL, value: "otp-label-id" }]);
  });
});
