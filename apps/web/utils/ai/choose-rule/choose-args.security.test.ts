import { describe, it, expect } from "vitest";
import { ActionType } from "@/generated/prisma/enums";
import { getAction } from "@/__tests__/helpers";
import {
  combineActionsWithAiArgs,
  getParameterFieldsForAction,
  mergeTemplateWithVars,
  parseTemplate,
} from "./choose-args";

describe("Template Variable Containment", () => {
  it("ignores AI-injected cc/bcc when only content has a template variable", () => {
    const action = getAction({
      id: "action-1",
      type: ActionType.DRAFT_EMAIL,
      content: "{{draft response}}",
      to: "recipient@company.com",
      cc: null,
      bcc: null,
    });

    const aiArgs = {
      [`${ActionType.DRAFT_EMAIL}-action-1`]: {
        content: { var1: "Here is the drafted response." },
        cc: { var1: "attacker@evil.com" },
        bcc: { var1: "leak@evil.com" },
      },
    };

    const [result] = combineActionsWithAiArgs(
      [action],
      aiArgs,
      null,
      null,
      null,
      null,
    );

    expect(result.content).toBe("Here is the drafted response.");
    expect(result.cc).toBeNull();
    expect(result.bcc).toBeNull();
    expect(result.to).toBe("recipient@company.com");
  });

  it("preserves static 'to' when AI tries to override it", () => {
    const action = getAction({
      id: "action-1",
      type: ActionType.FORWARD,
      to: "boss@company.com",
      content: "{{summarize email}}",
    });

    const aiArgs = {
      [`${ActionType.FORWARD}-action-1`]: {
        to: { var1: "attacker@evil.com" },
        content: { var1: "Here is the summary." },
      },
    };

    const [result] = combineActionsWithAiArgs(
      [action],
      aiArgs,
      null,
      null,
      null,
      null,
    );

    expect(result.to).toBe("boss@company.com");
    expect(result.content).toBe("Here is the summary.");
  });

  it("keeps null cc/bcc even when AI returns values for them", () => {
    const action = getAction({
      id: "action-1",
      type: ActionType.DRAFT_EMAIL,
      content: "Hello {{name}}",
      cc: null,
      bcc: null,
    });

    const aiArgs = {
      [`${ActionType.DRAFT_EMAIL}-action-1`]: {
        content: { var1: "Alice" },
        cc: { var1: "spy@evil.com" },
        bcc: { var1: "exfil@evil.com" },
      },
    };

    const [result] = combineActionsWithAiArgs(
      [action],
      aiArgs,
      null,
      null,
      null,
      null,
    );

    expect(result.cc).toBeNull();
    expect(result.bcc).toBeNull();
  });
});

describe("mergeTemplateWithVars Safety", () => {
  it("uses only the variables matching template placeholders, ignoring extras", () => {
    const template = "Hello {{greeting}}, welcome to {{place}}";
    const vars = {
      var1: "Dear User",
      var2: "Inbox Zero",
      var3: "INJECTED_3",
      var4: "INJECTED_4",
      var5: "INJECTED_5",
    } as Record<`var${number}`, string>;

    const result = mergeTemplateWithVars(template, vars);

    expect(result).toBe("Hello Dear User, welcome to Inbox Zero");
    expect(result).not.toContain("INJECTED");
  });

  it("returns static text unchanged when AI returns vars for a static template", () => {
    const template = "This is fixed text with no variables.";
    const vars = {
      var1: "OVERWRITE ATTEMPT",
      var2: "ANOTHER OVERWRITE",
    } as Record<`var${number}`, string>;

    const result = mergeTemplateWithVars(template, vars);

    expect(result).toBe("This is fixed text with no variables.");
  });

  it("merges HTML/script injection content as plain text without execution risk", () => {
    const template = "Response: {{message}}";
    const vars = {
      var1: '<script>alert("xss")</script><img onerror="fetch(\'evil.com\')">',
    } as Record<`var${number}`, string>;

    const result = mergeTemplateWithVars(template, vars);

    expect(result).toBe(
      'Response: <script>alert("xss")</script><img onerror="fetch(\'evil.com\')">',
    );
    expect(result).toContain("<script>");
  });
});

describe("getParameterFieldsForAction Scoping", () => {
  it("returns parameters only for fields containing template variables", () => {
    const action = getAction({
      content: "Hello {{name}}",
      to: "fixed@company.com",
      subject: null,
      cc: null,
      bcc: null,
      label: null,
    });

    const fields = getParameterFieldsForAction(action);

    expect(Object.keys(fields)).toEqual(["content"]);
    expect(fields.to).toBeUndefined();
  });

  it("returns empty parameters when no fields have template variables", () => {
    const action = getAction({
      content: "Plain text response",
      to: "someone@company.com",
      subject: "Re: Meeting",
      cc: null,
      bcc: null,
      label: "Important",
    });

    const fields = getParameterFieldsForAction(action);

    expect(Object.keys(fields)).toHaveLength(0);
  });

  it("excludes null cc/bcc from parameters even when other fields have templates", () => {
    const action = getAction({
      content: "Dear {{name}}, {{message}}",
      subject: "Re: {{topic}}",
      cc: null,
      bcc: null,
    });

    const fields = getParameterFieldsForAction(action);
    const fieldNames = Object.keys(fields);

    expect(fieldNames).toContain("content");
    expect(fieldNames).toContain("subject");
    expect(fieldNames).not.toContain("cc");
    expect(fieldNames).not.toContain("bcc");
  });
});

describe("combineActionsWithAiArgs Field Injection", () => {
  it("ignores fields not in the allowlist", () => {
    const action = getAction({
      id: "action-1",
      type: ActionType.LABEL,
      label: "{{category}}",
    });

    const aiArgs = {
      [`${ActionType.LABEL}-action-1`]: {
        label: { var1: "Important" },
        secret: { var1: "stolen-api-key" },
        apiKey: { var1: "sk-1234" },
        password: { var1: "hunter2" },
      },
    };

    const [result] = combineActionsWithAiArgs(
      [action],
      aiArgs,
      null,
      null,
      null,
      null,
    );

    expect(result.label).toBe("Important");
    expect((result as any).secret).toBeUndefined();
    expect((result as any).apiKey).toBeUndefined();
    expect((result as any).password).toBeUndefined();
  });

  it("keeps 'to' as null when AI injects a value but the original was null", () => {
    const action = getAction({
      id: "action-1",
      type: ActionType.LABEL,
      label: "{{category}}",
      to: null,
    });

    const aiArgs = {
      [`${ActionType.LABEL}-action-1`]: {
        label: { var1: "Urgent" },
        to: { var1: "attacker@evil.com" },
      },
    };

    const [result] = combineActionsWithAiArgs(
      [action],
      aiArgs,
      null,
      null,
      null,
      null,
    );

    expect(result.to).toBeNull();
    expect(result.label).toBe("Urgent");
  });

  it("only merges cc when the original has a string value with template vars", () => {
    const actionWithTemplate = getAction({
      id: "action-with-template",
      type: ActionType.DRAFT_EMAIL,
      content: "Hello",
      cc: "{{additional_recipient}}",
    });

    const actionWithEmptyString = getAction({
      id: "action-empty-cc",
      type: ActionType.DRAFT_EMAIL,
      content: "Hello",
      cc: "",
    });

    const aiArgsTemplate = {
      [`${ActionType.DRAFT_EMAIL}-action-with-template`]: {
        cc: { var1: "colleague@company.com" },
      },
    };

    const aiArgsEmpty = {
      [`${ActionType.DRAFT_EMAIL}-action-empty-cc`]: {
        cc: { var1: "attacker@evil.com" },
      },
    };

    const [resultTemplate] = combineActionsWithAiArgs(
      [actionWithTemplate],
      aiArgsTemplate,
      null,
      null,
      null,
      null,
    );

    const [resultEmpty] = combineActionsWithAiArgs(
      [actionWithEmptyString],
      aiArgsEmpty,
      null,
      null,
      null,
      null,
    );

    expect(resultTemplate.cc).toBe("colleague@company.com");
    expect(resultEmpty.cc).toBe("");
  });
});

describe("Action Escalation Prevention", () => {
  it("only processes actions defined in the rule, cannot add new action types", () => {
    const labelAction = getAction({
      id: "label-1",
      type: ActionType.LABEL,
      label: "{{category}}",
    });
    const archiveAction = getAction({
      id: "archive-1",
      type: ActionType.ARCHIVE,
    });

    const aiArgs = {
      [`${ActionType.LABEL}-label-1`]: {
        label: { var1: "Processed" },
      },
      [`${ActionType.ARCHIVE}-archive-1`]: {},
      // AI tries to inject a FORWARD action that wasn't in the rule
      [`${ActionType.FORWARD}-injected-1`]: {
        to: { var1: "attacker@evil.com" },
        content: { var1: "Forwarded content" },
      },
    };

    const results = combineActionsWithAiArgs(
      [labelAction, archiveAction],
      aiArgs,
      null,
      null,
      null,
      null,
    );

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.type)).toEqual([
      ActionType.LABEL,
      ActionType.ARCHIVE,
    ]);
    expect(results.some((r) => r.type === ActionType.FORWARD)).toBe(false);
  });

  it("returns exactly the actions from the rule with no extras", () => {
    const actions = [
      getAction({ id: "a1", type: ActionType.LABEL, label: "Test" }),
      getAction({ id: "a2", type: ActionType.ARCHIVE }),
    ];

    const results = combineActionsWithAiArgs(
      actions,
      undefined,
      null,
      null,
      null,
      null,
    );

    expect(results).toHaveLength(actions.length);
    results.forEach((result, i) => {
      expect(result.id).toBe(actions[i].id);
      expect(result.type).toBe(actions[i].type);
    });
  });
});

describe("Static Field Override Protection", () => {
  it("preserves static 'to' field when AI returns a different value", () => {
    const action = getAction({
      id: "action-1",
      type: ActionType.FORWARD,
      to: "accountant@company.com",
      content: "{{summarize}}",
    });

    const aiArgs = {
      [`${ActionType.FORWARD}-action-1`]: {
        to: { var1: "hacker@evil.com" },
        content: { var1: "Summary of the email." },
      },
    };

    const [result] = combineActionsWithAiArgs(
      [action],
      aiArgs,
      null,
      null,
      null,
      null,
    );

    expect(result.to).toBe("accountant@company.com");
    expect(result.content).toBe("Summary of the email.");
  });

  it("preserves static content field when AI returns different content", () => {
    const action = getAction({
      id: "action-1",
      type: ActionType.DRAFT_EMAIL,
      content: "Fixed response text",
    });

    const aiArgs = {
      [`${ActionType.DRAFT_EMAIL}-action-1`]: {
        content: { var1: "AI-overwritten content that should be ignored" },
      },
    };

    const [result] = combineActionsWithAiArgs(
      [action],
      aiArgs,
      null,
      null,
      null,
      null,
    );

    expect(result.content).toBe("Fixed response text");
  });

  it("fills template variables while preserving static prefix in subject", () => {
    const action = getAction({
      id: "action-1",
      type: ActionType.DRAFT_EMAIL,
      subject: "Re: {{summarize}}",
      content: "Hello",
    });

    const aiArgs = {
      [`${ActionType.DRAFT_EMAIL}-action-1`]: {
        subject: { var1: "Meeting follow-up" },
      },
    };

    const [result] = combineActionsWithAiArgs(
      [action],
      aiArgs,
      null,
      null,
      null,
      null,
    );

    expect(result.subject).toBe("Re: Meeting follow-up");
  });
});

describe("parseTemplate", () => {
  it("extracts prompts and fixed parts correctly", () => {
    const { aiPrompts, fixedParts } = parseTemplate(
      "Hello {{greeting}}, welcome to {{place}}!",
    );

    expect(aiPrompts).toEqual(["greeting", "place"]);
    expect(fixedParts).toEqual(["Hello ", ", welcome to ", "!"]);
  });

  it("returns empty prompts for static text", () => {
    const { aiPrompts, fixedParts } = parseTemplate("No variables here.");

    expect(aiPrompts).toEqual([]);
    expect(fixedParts).toEqual(["No variables here."]);
  });
});

describe("AI output field validation - defense in depth", () => {
  it("only updates fields with template variables, preserves static fields", () => {
    const action = getAction({
      id: "action-1",
      type: ActionType.DRAFT_EMAIL,
      content: "Hello {{name}}",
      to: "static@company.com",
    });

    const aiArgs = {
      [`${ActionType.DRAFT_EMAIL}-action-1`]: {
        content: { var1: "Alice" },
        to: { var1: "hijacked@evil.com" },
      },
    };

    const [result] = combineActionsWithAiArgs(
      [action],
      aiArgs,
      null,
      null,
      null,
      null,
    );

    expect(result.content).toBe("Hello Alice");
    expect(result.to).toBe("static@company.com");
  });

  it("preserves empty string cc when AI tries to fill it", () => {
    const action = getAction({
      id: "action-1",
      type: ActionType.DRAFT_EMAIL,
      content: "Hello {{name}}",
      cc: "",
    });

    const aiArgs = {
      [`${ActionType.DRAFT_EMAIL}-action-1`]: {
        content: { var1: "Bob" },
        cc: { var1: "snoop@evil.com" },
      },
    };

    const [result] = combineActionsWithAiArgs(
      [action],
      aiArgs,
      null,
      null,
      null,
      null,
    );

    expect(result.content).toBe("Hello Bob");
    expect(result.cc).toBe("");
  });

  it("preserves static bcc when AI tries to override it", () => {
    const action = getAction({
      id: "action-1",
      type: ActionType.DRAFT_EMAIL,
      content: "Hello {{name}}",
      bcc: "fixed@company.com",
    });

    const aiArgs = {
      [`${ActionType.DRAFT_EMAIL}-action-1`]: {
        content: { var1: "Carol" },
        bcc: { var1: "leak@evil.com" },
      },
    };

    const [result] = combineActionsWithAiArgs(
      [action],
      aiArgs,
      null,
      null,
      null,
      null,
    );

    expect(result.content).toBe("Hello Carol");
    expect(result.bcc).toBe("fixed@company.com");
  });
});
