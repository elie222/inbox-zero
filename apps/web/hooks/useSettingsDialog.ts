import { useCallback } from "react";
import { useQueryState } from "nuqs";

const SETTINGS_PARAM = "settings";
const SETTINGS_PARAM_VALUE = "open";

export function useSettingsDialog() {
  const [settings, setSettings] = useQueryState(SETTINGS_PARAM);

  const openSettings = useCallback(
    () => setSettings(SETTINGS_PARAM_VALUE),
    [setSettings],
  );
  const closeSettings = useCallback(() => setSettings(null), [setSettings]);

  return {
    isSettingsOpen: settings === SETTINGS_PARAM_VALUE,
    openSettings,
    closeSettings,
  };
}
