export function useModifierKey() {
  const isMac = /Mac|iPhone|iPod|iPad/.test(window.navigator.userAgent);

  return { symbol: isMac ? "⌘" : "Ctrl", isMac };
}
