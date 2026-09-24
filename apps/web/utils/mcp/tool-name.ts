// Model providers reject the whole request when any tool name falls outside this
const VALID_TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

export function isValidMcpToolName(name: string) {
  return VALID_TOOL_NAME.test(name);
}
