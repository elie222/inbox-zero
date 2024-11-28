// Returns true if contains "{{" and "}}".
export const hasVariables = (text: string) => /\{\{.*?\}\}/g.test(text);
