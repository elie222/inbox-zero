import { describe, it, expect } from "vitest";
import { convertMentionsToLabels, convertLabelsToDisplay } from "./mention";

describe("convertMentionsToLabels", () => {
  it("converts single mention to label", () => {
    const input = "Label this email as @[Newsletter]";
    const expected = "Label this email as Newsletter";

    expect(convertMentionsToLabels(input)).toBe(expected);
  });

  it("converts multiple mentions to labels", () => {
    const input = "Label as @[Important] and @[Work] and archive";
    const expected = "Label as Important and Work and archive";

    expect(convertMentionsToLabels(input)).toBe(expected);
  });

  it("handles mentions with spaces in label names", () => {
    const input = "Apply @[Very Important] and @[Work Project] labels";
    const expected = "Apply Very Important and Work Project labels";

    expect(convertMentionsToLabels(input)).toBe(expected);
  });

  it("handles mentions with special characters in label names", () => {
    const input = "Label as @[Finance/Tax] and @[Client-A] and @[2024_Q1]";
    const expected = "Label as Finance/Tax and Client-A and 2024_Q1";

    expect(convertMentionsToLabels(input)).toBe(expected);
  });

  it("handles mentions at the beginning of text", () => {
    const input = "@[Newsletter] emails should be archived";
    const expected = "Newsletter emails should be archived";

    expect(convertMentionsToLabels(input)).toBe(expected);
  });

  it("handles mentions at the end of text", () => {
    const input = "Archive and label as @[Newsletter]";
    const expected = "Archive and label as Newsletter";

    expect(convertMentionsToLabels(input)).toBe(expected);
  });

  it("handles text with no mentions", () => {
    const input = "Archive all newsletters automatically";
    const expected = "Archive all newsletters automatically";

    expect(convertMentionsToLabels(input)).toBe(expected);
  });

  it("handles empty string", () => {
    const input = "";
    const expected = "";

    expect(convertMentionsToLabels(input)).toBe(expected);
  });

  it("handles mentions in multiline text", () => {
    const input = `When I get a newsletter, archive it and label it as @[Newsletter]
    
    For urgent emails from company.com, label as @[Urgent] and forward to support@company.com`;

    const expected = `When I get a newsletter, archive it and label it as Newsletter
    
    For urgent emails from company.com, label as Urgent and forward to support@company.com`;

    expect(convertMentionsToLabels(input)).toBe(expected);
  });

  it("preserves regular @ symbols that are not mentions", () => {
    const input = "Forward to support@company.com and label as @[Support]";
    const expected = "Forward to support@company.com and label as Support";

    expect(convertMentionsToLabels(input)).toBe(expected);
  });

  it("handles malformed mentions gracefully", () => {
    const input = "Label as @[Newsletter and @Missing] and @[Complete]";
    const expected = "Label as Newsletter and @Missing and Complete";

    expect(convertMentionsToLabels(input)).toBe(expected);
  });

  it("handles nested brackets in mentions", () => {
    const input = "Label as @[Project [Alpha]] and continue";
    const expected = "Label as Project [Alpha] and continue";

    expect(convertMentionsToLabels(input)).toBe(expected);
  });

  it("handles mentions with numbers and symbols", () => {
    const input = "Apply @[2024-Q1] and @[Client#123] labels";
    const expected = "Apply 2024-Q1 and Client#123 labels";

    expect(convertMentionsToLabels(input)).toBe(expected);
  });

  it("handles complex rule with multiple mentions", () => {
    const input = `If someone asks to set up a call, draft a reply and label as @[Meeting Request]
    
    For newsletters from marketing@company.com, archive and label as @[Newsletter] and @[Marketing]`;

    const expected = `If someone asks to set up a call, draft a reply and label as Meeting Request
    
    For newsletters from marketing@company.com, archive and label as Newsletter and Marketing`;

    expect(convertMentionsToLabels(input)).toBe(expected);
  });
});

describe("convertLabelsToDisplay", () => {
  it("converts single mention to quoted label", () => {
    const input = "Label this email as @[Newsletter]";
    const expected = 'Label this email as "Newsletter"';

    expect(convertLabelsToDisplay(input)).toBe(expected);
  });

  it("converts multiple mentions to quoted labels", () => {
    const input = "Label as @[Important] and @[Work] and archive";
    const expected = 'Label as "Important" and "Work" and archive';

    expect(convertLabelsToDisplay(input)).toBe(expected);
  });

  it("handles mentions with spaces in label names", () => {
    const input = "Apply @[Very Important] and @[Work Project] labels";
    const expected = 'Apply "Very Important" and "Work Project" labels';

    expect(convertLabelsToDisplay(input)).toBe(expected);
  });

  it("handles mentions with special characters in label names", () => {
    const input = "Label as @[Finance/Tax] and @[Client-A] and @[2024_Q1]";
    const expected = 'Label as "Finance/Tax" and "Client-A" and "2024_Q1"';

    expect(convertLabelsToDisplay(input)).toBe(expected);
  });

  it("handles mentions at the beginning of text", () => {
    const input = "@[Newsletter] emails should be archived";
    const expected = '"Newsletter" emails should be archived';

    expect(convertLabelsToDisplay(input)).toBe(expected);
  });

  it("handles mentions at the end of text", () => {
    const input = "Archive and label as @[Newsletter]";
    const expected = 'Archive and label as "Newsletter"';

    expect(convertLabelsToDisplay(input)).toBe(expected);
  });

  it("handles text with no mentions", () => {
    const input = "Archive all newsletters automatically";
    const expected = "Archive all newsletters automatically";

    expect(convertLabelsToDisplay(input)).toBe(expected);
  });

  it("handles empty string", () => {
    const input = "";
    const expected = "";

    expect(convertLabelsToDisplay(input)).toBe(expected);
  });

  it("handles mentions in multiline text", () => {
    const input = `When I get a newsletter, archive it and label it as @[Newsletter]
    
    For urgent emails from company.com, label as @[Urgent] and forward to support@company.com`;

    const expected = `When I get a newsletter, archive it and label it as "Newsletter"
    
    For urgent emails from company.com, label as "Urgent" and forward to support@company.com`;

    expect(convertLabelsToDisplay(input)).toBe(expected);
  });

  it("preserves regular @ symbols that are not mentions", () => {
    const input = "Forward to support@company.com and label as @[Support]";
    const expected = 'Forward to support@company.com and label as "Support"';

    expect(convertLabelsToDisplay(input)).toBe(expected);
  });

  it("handles malformed mentions gracefully", () => {
    const input = "Label as @[Newsletter and @Missing] and @[Complete]";
    const expected = 'Label as "Newsletter and @Missing" and "Complete"';

    expect(convertLabelsToDisplay(input)).toBe(expected);
  });

  it("handles nested brackets in mentions", () => {
    const input = "Label as @[Project [Alpha]] and continue";
    const expected = 'Label as "Project [Alpha]" and continue';

    expect(convertLabelsToDisplay(input)).toBe(expected);
  });

  it("handles mentions with numbers and symbols", () => {
    const input = "Apply @[2024-Q1] and @[Client#123] labels";
    const expected = 'Apply "2024-Q1" and "Client#123" labels';

    expect(convertLabelsToDisplay(input)).toBe(expected);
  });
});
