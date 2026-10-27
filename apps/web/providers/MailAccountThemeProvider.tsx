"use client";

import {
  createContext,
  useContext,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useAccounts } from "@/hooks/useAccounts";

const ACCOUNT_HUES = [165, 285, 85, 28, 212, 345, 245, 45];
type MailAccountTheme = CSSProperties & {
  "--mail-hue": number;
  "--mail-saturation": string;
};
const NEUTRAL_THEME: MailAccountTheme = {
  "--mail-hue": 0,
  "--mail-saturation": "0%",
};
const MailAccountThemes = createContext<Record<string, MailAccountTheme>>({});

export function MailAccountThemeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { data } = useAccounts();
  const themes = useMemo(
    () =>
      Object.fromEntries(
        // The accounts API orders by creation time, so switching views or
        // excluding an account from the combined inbox keeps its color.
        (data?.emailAccounts ?? []).map((account, index) => [
          account.id,
          {
            "--mail-hue": ACCOUNT_HUES[index % ACCOUNT_HUES.length],
            "--mail-saturation": "14%",
          } as MailAccountTheme,
        ]),
      ),
    [data?.emailAccounts],
  );

  return (
    <MailAccountThemes.Provider value={themes}>
      {children}
    </MailAccountThemes.Provider>
  );
}

export function useMailAccountTheme(accountId?: string | null) {
  const themes = useContext(MailAccountThemes);
  return (accountId && themes[accountId]) || NEUTRAL_THEME;
}
