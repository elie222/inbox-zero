import { Kbd } from "@/components/Kbd";
import {
  getShortcut,
  getShortcutKeyLabels,
  type ShortcutId,
} from "@/lib/shortcuts/registry";

export type ShortcutTooltipItem =
  | ShortcutId
  | { id: ShortcutId; label: string };

export function ShortcutTooltipContent({
  shortcuts,
}: {
  shortcuts: readonly ShortcutTooltipItem[];
}) {
  return (
    <div className="space-y-1.5 py-0.5">
      {shortcuts.map((shortcut) => {
        const id = shortcutId(shortcut);
        return (
          <div className="flex items-center justify-between gap-6" key={id}>
            <span className="font-medium text-white">
              {shortcutLabel(shortcut)}
            </span>
            <div className="flex items-center gap-1">
              {getShortcutKeyLabels(id).map((key) => (
                <Kbd
                  className="h-5 min-w-5 px-1.5 font-sans text-[11px]"
                  key={`${id}-${key}`}
                  variant="onColor"
                >
                  {key}
                </Kbd>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function shortcutId(shortcut: ShortcutTooltipItem): ShortcutId {
  return typeof shortcut === "string" ? shortcut : shortcut.id;
}

function shortcutLabel(shortcut: ShortcutTooltipItem) {
  return typeof shortcut === "string"
    ? getShortcut(shortcut).label
    : shortcut.label;
}
