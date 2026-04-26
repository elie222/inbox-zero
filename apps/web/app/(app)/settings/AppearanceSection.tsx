"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Switch } from "@/components/ui/switch";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";

export function AppearanceSection() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDarkMode = mounted && resolvedTheme === "dark";

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>Dark mode</ItemTitle>
        <ItemDescription>
          Use the dark color theme across the app.
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Switch
          aria-label="Toggle dark mode"
          checked={isDarkMode}
          onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
          disabled={!mounted}
        />
      </ItemActions>
    </Item>
  );
}
