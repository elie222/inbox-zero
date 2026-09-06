import { Kbd } from "@/components/Kbd";
import {
  getShortcut,
  getShortcutHint,
  type ShortcutId,
} from "@/lib/shortcuts/registry";

export function ComposeShortcutTooltipContent({
  shortcuts,
}: {
  shortcuts: readonly ShortcutId[];
}) {
  return (
    <div className="space-y-1.5">
      {shortcuts.map((shortcut) => (
        <div className="flex items-center justify-between gap-4" key={shortcut}>
          <span>{getShortcut(shortcut).label}</span>
          <Kbd variant="onColor">{getShortcutHint(shortcut)}</Kbd>
        </div>
      ))}
    </div>
  );
}
