import { describe, expect, it } from "vitest";
import { getDefaultLabelColorName } from "@/utils/label";
import { getRuleLabel } from "@/utils/rule/consts";
import { SystemType } from "@/generated/prisma/enums";
import { getDefaultOutlookCategoryColor } from "./category-colors";

describe("getDefaultOutlookCategoryColor", () => {
  it.each([
    [SystemType.NEWSLETTER, SystemType.NOTIFICATION],
    [SystemType.COLD_EMAIL, SystemType.FYI],
  ])("keeps the %s and %s categories apart, as Gmail does", (first, second) => {
    const firstColor = getDefaultLabelColorName(getRuleLabel(first));
    const secondColor = getDefaultLabelColorName(getRuleLabel(second));
    if (!firstColor || !secondColor) throw new Error("Missing default color");

    expect(firstColor).not.toBe(secondColor);
    expect(getDefaultOutlookCategoryColor(firstColor)).not.toBe(
      getDefaultOutlookCategoryColor(secondColor),
    );
  });
});
