import { describe, expect, test } from "vitest";
import { getMentionedMemberIds } from "@/utils/team-comments/mentions";

const jane = { memberId: "jane", name: "Jane" };
const janeDoe = { memberId: "jane-doe", name: "Jane Doe" };
const bob = { memberId: "bob", name: "bob@acme.com" };

describe("getMentionedMemberIds", () => {
  test("counts a teammate whose full name was typed without picking a suggestion", () => {
    expect(
      getMentionedMemberIds("@Jane Doe can you take a look?", [jane, janeDoe]),
    ).toEqual(["jane-doe"]);
  });

  test("counts typed mentions of teammates shown by email", () => {
    expect(getMentionedMemberIds("ping @bob@acme.com", [bob])).toEqual(["bob"]);
  });

  test("keeps both mentions when one name is a prefix of another", () => {
    expect(
      getMentionedMemberIds("@Jane and @Jane Doe", [jane, janeDoe]).sort(),
    ).toEqual(["jane", "jane-doe"]);
  });

  test("ignores names that are not standalone mentions", () => {
    expect(
      getMentionedMemberIds("Jane, email x@Jane Doe or @Janet", [
        jane,
        janeDoe,
      ]),
    ).toEqual([]);
  });

  test("uses the picked suggestion to tell teammates with the same name apart", () => {
    const otherJane = { memberId: "other-jane", name: "Jane" };
    expect(getMentionedMemberIds("@Jane hi", [jane, otherJane])).toEqual([]);
    expect(
      getMentionedMemberIds("@Jane hi", [jane, otherJane], ["other-jane"]),
    ).toEqual(["other-jane"]);
  });

  test("drops a picked suggestion once its mention is removed from the text", () => {
    expect(getMentionedMemberIds("hi", [jane], ["jane"])).toEqual([]);
  });
});
