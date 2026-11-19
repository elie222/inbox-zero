import { describe, expect, it } from "vitest";
import { GmailLabel } from "@/utils/gmail/label";
import { getThreadOtpCode } from "./otp-code";

const otpLabel = { id: "Label_otp", name: "OTP" };
const userLabels = { [otpLabel.id]: otpLabel };

describe("getThreadOtpCode", () => {
  it("ignores a newer draft when selecting the OTP code", () => {
    expect(
      getThreadOtpCode(
        {
          snippet: "Code: 123456",
          messages: [
            {
              subject: "Your login code",
              date: "2026-01-01T00:00:00Z",
              snippet: "Code: 918273",
            },
            {
              subject: "Your login code",
              date: "2026-01-02T00:00:00Z",
              snippet: "Code: 123456",
              labelIds: [GmailLabel.DRAFT],
            },
          ],
        },
        userLabels,
      ),
    ).toBe("918273");
  });

  it("does not qualify a later ordinary message using an older OTP label", () => {
    expect(
      getThreadOtpCode(
        {
          snippet: "Invoice 482913",
          messages: [
            {
              subject: "Your login code",
              date: "2026-01-01T00:00:00Z",
              snippet: "123456",
              labelIds: [otpLabel.id],
            },
            {
              subject: "Invoice 482913",
              date: "2026-01-02T00:00:00Z",
              snippet: "Invoice 482913",
              labelIds: [],
            },
          ],
        },
        userLabels,
      ),
    ).toBeNull();
  });

  it("extracts from the latest labeled message instead of the thread snippet", () => {
    expect(
      getThreadOtpCode(
        {
          snippet: "Invoice 482913",
          messages: [
            {
              subject: "Invoice 482913",
              date: "2026-01-01T00:00:00Z",
              snippet: "Invoice 482913",
            },
            {
              subject: "Account access",
              date: "2026-01-02T00:00:00Z",
              snippet: "Your code: 918273",
              labelIds: [otpLabel.id],
            },
          ],
        },
        userLabels,
      ),
    ).toBe("918273");
  });

  it("recognizes the latest OTP subject without a label and decodes its snippet", () => {
    expect(
      getThreadOtpCode(
        {
          snippet: "",
          messages: [
            {
              subject: "Your login code",
              date: "2026-01-01T00:00:00Z",
              snippet: "Code: &#57;18273",
            },
          ],
        },
        {},
      ),
    ).toBe("918273");
  });

  it.each([
    "1767312000000",
    null,
    "invalid",
  ])("extracts the newest OTP from out-of-order messages (internalDate: %s)", (internalDate) => {
    expect(
      getThreadOtpCode(
        {
          snippet: "Code: 123456",
          messages: [
            {
              subject: "Your login code",
              snippet: "Code: 918273",
              internalDate,
              date: "2026-01-02T00:00:00Z",
            },
            {
              subject: "Your login code",
              snippet: "Code: 123456",
              internalDate: "1767225600000",
              date: "2026-01-01T00:00:00Z",
            },
          ],
        },
        {},
      ),
    ).toBe("918273");
  });

  it("returns no code for an empty thread", () => {
    expect(
      getThreadOtpCode({ snippet: "123456", messages: [] }, userLabels),
    ).toBeNull();
  });

  it("reads the code from a message whose OTP label is hidden from the list", () => {
    const hiddenOtpLabel = {
      id: "Label_otp",
      name: "OTP",
      messageListVisibility: "hide",
    };
    expect(
      getThreadOtpCode(
        {
          snippet: "Use 482913 to continue",
          messages: [
            {
              subject: "Welcome back",
              date: "2026-01-01T00:00:00Z",
              snippet: "Use 482913 to continue",
              labelIds: [hiddenOtpLabel.id],
            },
          ],
        },
        { [hiddenOtpLabel.id]: hiddenOtpLabel },
      ),
    ).toBe("482913");
  });
});
