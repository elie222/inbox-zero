import { describe, expect, it } from "vitest";
import { getThreadOtpCode } from "./otp-code";

const otpLabel = { id: "Label_otp", name: "OTP" };
const userLabels = { [otpLabel.id]: otpLabel };

describe("getThreadOtpCode", () => {
  it("does not qualify a later ordinary message using an older OTP label", () => {
    expect(
      getThreadOtpCode(
        {
          snippet: "Invoice 482913",
          messages: [
            {
              subject: "Your login code",
              snippet: "123456",
              labelIds: [otpLabel.id],
            },
            {
              subject: "Invoice 482913",
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
            { subject: "Invoice 482913", snippet: "Invoice 482913" },
            {
              subject: "Account access",
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
            { subject: "Your login code", snippet: "Code: &#57;18273" },
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
});
