import { describe, it, expect } from "vitest";
import { convertMentionsToLabels, convertLabelsToDisplay } from "./mention";

describe("convertMentionsToLabels", () => {
  it.each(getMentionConversionCases())("converts $name", ({
    input,
    labelText,
  }) => {
    expect(convertMentionsToLabels(input)).toBe(labelText);
  });
});

describe("convertLabelsToDisplay", () => {
  it.each(getMentionConversionCases())("converts $name", ({
    input,
    displayText,
  }) => {
    expect(convertLabelsToDisplay(input)).toBe(displayText);
  });
});

function getMentionConversionCases() {
  return [
    {
      name: "single mention",
      input: "Label this email as @[Newsletter]",
      labelText: "Label this email as Newsletter",
      displayText: 'Label this email as "Newsletter"',
    },
    {
      name: "multiple mentions",
      input: "Label as @[Important] and @[Work] and archive",
      labelText: "Label as Important and Work and archive",
      displayText: 'Label as "Important" and "Work" and archive',
    },
    {
      name: "mentions with spaces in label names",
      input: "Apply @[Very Important] and @[Work Project] labels",
      labelText: "Apply Very Important and Work Project labels",
      displayText: 'Apply "Very Important" and "Work Project" labels',
    },
    {
      name: "mentions with special characters in label names",
      input: "Label as @[Finance/Tax] and @[Client-A] and @[2024_Q1]",
      labelText: "Label as Finance/Tax and Client-A and 2024_Q1",
      displayText: 'Label as "Finance/Tax" and "Client-A" and "2024_Q1"',
    },
    {
      name: "mention at the beginning of text",
      input: "@[Newsletter] emails should be archived",
      labelText: "Newsletter emails should be archived",
      displayText: '"Newsletter" emails should be archived',
    },
    {
      name: "mention at the end of text",
      input: "Archive and label as @[Newsletter]",
      labelText: "Archive and label as Newsletter",
      displayText: 'Archive and label as "Newsletter"',
    },
    {
      name: "text with no mentions",
      input: "Archive all newsletters automatically",
      labelText: "Archive all newsletters automatically",
      displayText: "Archive all newsletters automatically",
    },
    {
      name: "empty string",
      input: "",
      labelText: "",
      displayText: "",
    },
    {
      name: "mentions in multiline text",
      input: `When I get a newsletter, archive it and label it as @[Newsletter]
    
    For urgent emails from company.com, label as @[Urgent] and forward to support@company.com`,
      labelText: `When I get a newsletter, archive it and label it as Newsletter
    
    For urgent emails from company.com, label as Urgent and forward to support@company.com`,
      displayText: `When I get a newsletter, archive it and label it as "Newsletter"
    
    For urgent emails from company.com, label as "Urgent" and forward to support@company.com`,
    },
    {
      name: "regular @ symbols that are not mentions",
      input: "Forward to support@company.com and label as @[Support]",
      labelText: "Forward to support@company.com and label as Support",
      displayText: 'Forward to support@company.com and label as "Support"',
    },
    {
      name: "malformed mentions",
      input: "Label as @[Newsletter and @Missing] and @[Complete]",
      labelText: "Label as Newsletter and @Missing and Complete",
      displayText: 'Label as "Newsletter and @Missing" and "Complete"',
    },
    {
      name: "nested brackets in mentions",
      input: "Label as @[Project [Alpha]] and continue",
      labelText: "Label as Project [Alpha] and continue",
      displayText: 'Label as "Project [Alpha]" and continue',
    },
    {
      name: "mentions with numbers and symbols",
      input: "Apply @[2024-Q1] and @[Client#123] labels",
      labelText: "Apply 2024-Q1 and Client#123 labels",
      displayText: 'Apply "2024-Q1" and "Client#123" labels',
    },
    {
      name: "complex rule with multiple mentions",
      input: `If someone asks to set up a call, draft a reply and label as @[Meeting Request]
    
    For newsletters from marketing@company.com, archive and label as @[Newsletter] and @[Marketing]`,
      labelText: `If someone asks to set up a call, draft a reply and label as Meeting Request
    
    For newsletters from marketing@company.com, archive and label as Newsletter and Marketing`,
      displayText: `If someone asks to set up a call, draft a reply and label as "Meeting Request"
    
    For newsletters from marketing@company.com, archive and label as "Newsletter" and "Marketing"`,
    },
  ];
}
