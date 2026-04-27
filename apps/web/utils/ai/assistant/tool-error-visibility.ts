const HIDE_TOOL_ERROR_FROM_USER = "hidden" as const;

export function hideToolErrorFromUser<T extends Record<string, unknown>>(
  output: T,
) {
  return {
    ...output,
    toolErrorVisibility: HIDE_TOOL_ERROR_FROM_USER,
  };
}

export function isToolErrorHiddenFromUser(output: unknown) {
  return (
    typeof output === "object" &&
    output !== null &&
    "toolErrorVisibility" in output &&
    output.toolErrorVisibility === HIDE_TOOL_ERROR_FROM_USER
  );
}
