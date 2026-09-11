"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { HotkeysProvider, useHotkeysContext } from "react-hotkeys-hook";
import type { ShortcutScope } from "@/lib/shortcuts/registry";

/**
 * Enables the given shortcut scopes for everything it wraps. Bindings from
 * other scopes stay registered but inert, so mail keys do nothing elsewhere.
 *
 * Pass a stable `scopes` array (a module constant) — it drives an effect.
 */
export function ShortcutsProvider({
  scopes,
  children,
}: {
  scopes: readonly ShortcutScope[];
  children: ReactNode;
}) {
  return (
    <HotkeysProvider initiallyActiveScopes={[...scopes]}>
      <ActiveScopes scopes={scopes} />
      {children}
    </HotkeysProvider>
  );
}

function ActiveScopes({ scopes }: { scopes: readonly ShortcutScope[] }) {
  const { activeScopes, enableScope, disableScope } = useHotkeysContext();

  useEffect(() => {
    for (const scope of scopes) {
      if (!activeScopes.includes(scope)) enableScope(scope);
    }
    for (const scope of activeScopes) {
      if (!scopes.includes(scope as ShortcutScope)) disableScope(scope);
    }
  }, [scopes, activeScopes, enableScope, disableScope]);

  return null;
}
