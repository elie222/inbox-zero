import clsx from "clsx";

const promptHistory = [
  {
    id: 1,
    name: "Find calendar invites",
    href: "#",
    initial: "H",
    current: false,
  },
  { id: 2, name: "Messages to James", href: "#", initial: "T", current: false },
  { id: 3, name: "Support emails", href: "#", initial: "W", current: false },
];

export function PromptHistoryMobile(props: {}) {
  return (
    <li>
      <div className="text-xs font-semibold leading-6 text-gray-400">
        Prompt history
      </div>
      <ul role="list" className="-mx-2 mt-2 space-y-1">
        {promptHistory.map((team) => (
          <li key={team.name}>
            <a
              href={team.href}
              className={clsx(
                team.current
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white",
                "group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6"
              )}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-[0.625rem] font-medium text-gray-400 group-hover:text-white">
                {team.initial}
              </span>
              <span className="truncate">{team.name}</span>
            </a>
          </li>
        ))}
      </ul>
    </li>
  );
}

export function PromptHistoryDesktop(props: {}) {
  return (
    <li>
      <div className="text-xs font-semibold leading-6 text-gray-400">
        Prompt history
      </div>
      <ul role="list" className="-mx-2 mt-2 space-y-1">
        {promptHistory.map((team) => (
          <li key={team.name}>
            <a
              href={team.href}
              className={clsx(
                team.current
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white",
                "group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6"
              )}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-[0.625rem] font-medium text-gray-400 group-hover:text-white">
                {team.initial}
              </span>
              <span className="truncate">{team.name}</span>
            </a>
          </li>
        ))}
      </ul>
    </li>
  );
}
