import { useLocalStorage } from "usehooks-ts";

// Read after mount so a saved value doesn't mismatch the server render.
export function useShowTooltips() {
  return useLocalStorage("interface-show-tooltips", true, {
    initializeWithValue: false,
  });
}

export function useAlwaysShowEmailCheckbox() {
  return useLocalStorage("interface-always-show-email-checkbox", false, {
    initializeWithValue: false,
  });
}
