export function KeyboardShortcutsIllustration() {
  const shortcuts = [
    { keys: ["⌘", "K"], action: "Command palette" },
    { keys: ["J"], action: "Next email" },
    { keys: ["E"], action: "Archive" },
  ];

  return (
    <div className="relative h-44 overflow-hidden rounded-lg bg-gradient-to-br from-slate-100 to-gray-200 dark:from-slate-800 dark:to-gray-900">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 py-8">
        {shortcuts.map((shortcut, index) => (
          <div
            key={index}
            className="flex w-full max-w-[180px] items-center justify-between gap-3"
          >
            {/* Keys */}
            <div className="flex items-center gap-1">
              {shortcut.keys.map((key, keyIndex) => (
                <span key={keyIndex}>
                  <kbd className="inline-flex min-w-[24px] items-center justify-center rounded-md border border-gray-300 bg-white px-1.5 py-1 font-mono text-[11px] font-semibold text-gray-700 shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200">
                    {key}
                  </kbd>
                  {keyIndex < shortcut.keys.length - 1 && (
                    <span className="mx-0.5 text-[10px] text-gray-400">+</span>
                  )}
                </span>
              ))}
            </div>

            {/* Action */}
            <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
              {shortcut.action}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
