"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import {
  useAlwaysShowEmailCheckbox,
  useShowTooltips,
} from "@/hooks/useInterfacePreferences";

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [showTooltips, setShowTooltips] = useShowTooltips();
  const [alwaysShowCheckbox, setAlwaysShowCheckbox] =
    useAlwaysShowEmailCheckbox();

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <Item size="sm">
        <ItemContent>
          <ItemTitle>Theme</ItemTitle>
        </ItemContent>
        <ItemActions>
          <Select
            value={mounted ? theme : undefined}
            onValueChange={setTheme}
            disabled={!mounted}
          >
            <SelectTrigger aria-label="Theme" className="h-8 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </ItemActions>
      </Item>
      <ItemSeparator />
      <Item size="sm">
        <ItemContent>
          <ItemTitle>Show tooltips</ItemTitle>
        </ItemContent>
        <ItemActions>
          <Switch
            aria-label="Toggle tooltips"
            checked={showTooltips}
            onCheckedChange={setShowTooltips}
            disabled={!mounted}
          />
        </ItemActions>
      </Item>
      <ItemSeparator />
      <Item size="sm">
        <ItemContent>
          <ItemTitle>Always show email checkboxes</ItemTitle>
        </ItemContent>
        <ItemActions>
          <Switch
            aria-label="Toggle always showing email checkboxes"
            checked={alwaysShowCheckbox}
            onCheckedChange={setAlwaysShowCheckbox}
            disabled={!mounted}
          />
        </ItemActions>
      </Item>
    </>
  );
}
