// Regex pattern to match template variables like {{variable}} including multi-line
export const TEMPLATE_VARIABLE_PATTERN = "\\{\\{[\\s\\S]*?\\}\\}";

// Returns true if contains "{{" and "}}".
export const hasVariables = (text: string | undefined | null) =>
  text ? new RegExp(TEMPLATE_VARIABLE_PATTERN).test(text) : false;
