export function useModifierKey() {
  const isMac =
    typeof window === "undefined" ||
    /Mac|iPhone|iPod|iPad/.test(window.navigator.userAgent);

  return { symbol: isMac ? "⌘" : "Ctrl", isMac };
}
