"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface TabsProps {
  tabs: Tab[];
  selected: string;
  breakpoint?: "xs" | "sm" | "md" | "lg" | "xl";
  onClickTab?: (tab: Tab) => void;
  shallow?: boolean;
}

interface Tab {
  label: string;
  value: string;
  href?: string;
}

export function Tabs(props: TabsProps) {
  const { tabs, selected, breakpoint = "sm", onClickTab } = props;
  const router = useRouter();

  return (
    <div className="w-full">
      <div
        className={clsx({
          hidden: breakpoint === "xs",
          "sm:hidden": breakpoint === "sm",
          "md:hidden": breakpoint === "md",
          "lg:hidden": breakpoint === "lg",
          "xl:hidden": breakpoint === "xl",
        })}
      >
        <label htmlFor="tabs" className="sr-only">
          Select a tab
        </label>
        <select
          id="tabs"
          name="tabs"
          className="block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          defaultValue={selected}
          onChange={(e) => {
            const label = e.target.value;
            const tab = tabs.find((t) => t.label === label);
            if (tab) {
              onClickTab?.(tab);
              // @ts-ignore
              if (tab.href) router.push(tab.href);
            }
          }}
        >
          {tabs.map((tab) => (
            <option key={tab.label}>{tab.label}</option>
          ))}
        </select>
      </div>
      <div
        className={clsx({
          block: breakpoint === "xs",
          "hidden sm:block": breakpoint === "sm",
          "hidden md:block": breakpoint === "md",
          "hidden lg:block": breakpoint === "lg",
          "hidden xl:block": breakpoint === "xl",
        })}
      >
        <nav className="flex space-x-4" aria-label="Tabs">
          {tabs.map((tab) => {
            const isSelected = tab.value === selected;

            return (
              <Link
                key={tab.value}
                // @ts-ignore
                href={tab.href || "#"}
                className={clsx(
                  "whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium",
                  isSelected
                    ? "bg-blue-100 text-blue-700"
                    : "text-muted-foreground hover:text-gray-700",
                )}
                aria-current={isSelected ? "page" : undefined}
                onClick={onClickTab ? () => onClickTab(tab) : undefined}
                shallow={props.shallow}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
