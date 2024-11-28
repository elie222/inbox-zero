// Returns true if contains "{{" and "}}".
export const hasVariables = (text: string | undefined | null) =>
  text ? /\{\{.*?\}\}/g.test(text) : false;
