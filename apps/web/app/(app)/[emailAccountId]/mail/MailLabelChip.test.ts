import { describe, expect, it } from "vitest";
import {
  CHIP_COLORS,
  chipColorForLabel,
} from "@/app/(app)/[emailAccountId]/mail/MailLabelChip";

describe("chipColorForLabel", () => {
  it("gives product labels their fixed colour, however they are cased", () => {
    expect(chipColorForLabel("To Reply")).toBe("blue");
    expect(chipColorForLabel("to reply")).toBe("blue");
    expect(chipColorForLabel("  Cold Email  ")).toBe("red");
    expect(chipColorForLabel("Newsletter")).toBe("gray");
    expect(chipColorForLabel("Awaiting Reply")).toBe("cyan");
  });

  it("keeps an unknown label on one colour across calls", () => {
    const names = ["Acme Corp", "shipping", "🚀 launch", "", "a"];

    for (const name of names) {
      const color = chipColorForLabel(name);
      expect(CHIP_COLORS).toContain(color);
      expect(chipColorForLabel(name)).toBe(color);
    }
  });

  it("keeps an unknown label on one colour however the provider cases it", () => {
    const color = chipColorForLabel("Acme Corp");

    expect(chipColorForLabel("acme corp")).toBe(color);
    expect(chipColorForLabel("ACME CORP")).toBe(color);
    expect(chipColorForLabel("  Acme Corp  ")).toBe(color);
  });

  it("spreads unknown labels over the palette rather than collapsing to one", () => {
    const colors = new Set(
      Array.from({ length: 60 }, (_, index) =>
        chipColorForLabel(`label-${index}`),
      ),
    );

    expect(colors.size).toBeGreaterThan(1);
  });

  it("does not treat labels that merely contain a known name as known", () => {
    expect(chipColorForLabel("Newsletters")).not.toBe(
      chipColorForLabel("Newsletter"),
    );
  });
});
