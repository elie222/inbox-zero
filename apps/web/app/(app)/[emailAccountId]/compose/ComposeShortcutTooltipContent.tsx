import { Kbd } from "@/components/Kbd";
import {
  getShortcut,
  getShortcutKeyLabels,
  type ShortcutId,
} from "@/lib/shortcuts/registry";

export function ComposeShortcutTooltipContent({
  shortcuts,
}: {
  shortcuts: readonly ShortcutId[];
}) {
  return (
    <div className="space-y-1.5 py-0.5">
      {shortcuts.map((shortcut) => (
        <div className="flex items-center justify-between gap-6" key={shortcut}>
          <span className="font-medium">{getShortcut(shortcut).label}</span>
          <div className="flex items-center gap-1">
            {getShortcutKeyLabels(shortcut).map((key) => (
              <Kbd
                className="h-5 min-w-5 px-1.5 font-sans text-[11px]"
                key={`${shortcut}-${key}`}
                variant="onColor"
              >
                {key}
              </Kbd>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
