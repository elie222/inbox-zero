import json5 from "json5";

export const parseJSON = (text: string) => {
  try {
    return json5.parse(text);
  } catch (error) {
    console.error(`Error parsing JSON. Text: ${text}`);
    throw error;
  }
};

// OpenAI sends us multiline JSON with newlines inside strings which we need to fix.
export function parseJSONWithMultilines(text: string) {
  try {
    const escapedNewlines = text
      .split('"')
      .map((s, i) => {
        const inQuotes = i % 2 === 1;
        if (inQuotes) return s.replaceAll("\n", "\\n");
        return s;
      })
      .join('"');

    return JSON.parse(escapedNewlines);
  } catch (error) {
    console.error(`Error parsing JSON with multiline. Text: ${text}`);
    throw error;
  }
}
