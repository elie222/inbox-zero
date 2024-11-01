"use client";

// from: https://github.com/shadcn-ui/ui/issues/414#issuecomment-1772421366

import * as React from "react";
import Link, { type LinkProps } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/utils";

interface Context {
  defaultValue: string;
  hrefFor: (value: string) => LinkProps["href"];
  searchParam: string;
  selected: string;
}
const TabsContext = React.createContext<Context>(null as any);

export function Tabs(props: {
  children: React.ReactNode;
  className?: string;
  /**
   * The default tab
   */
  defaultValue: string;
  /**
   * Which search param to use
   * @default "tab"
   */
  searchParam?: string;
}) {
  const { children, className, searchParam = "tab", ...other } = props;
  const searchParams = useSearchParams();

  const selected = searchParams.get(searchParam) || props.defaultValue;

  const pathname = usePathname();
  const hrefFor: Context["hrefFor"] = React.useCallback(
    (value) => {
      const params = new URLSearchParams(searchParams);
      if (value === props.defaultValue) {
        params.delete(searchParam);
      } else {
        params.set(searchParam, value);
      }

      const asString = params.toString();

      return pathname + (asString ? `?${asString}` : "");
    },
    [searchParams, props.defaultValue, pathname, searchParam],
  );

  return (
    <TabsContext.Provider value={{ ...other, hrefFor, searchParam, selected }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

const useContext = () => {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error(
      "Tabs compound components cannot be rendered outside the Tabs component",
    );
  }

  return context;
};

export function TabsList(props: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      {...props}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-slate-100 p-1 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
        props.className,
      )}
    />
  );
}

export const TabsTrigger = (props: {
  children: React.ReactNode;
  className?: string;
  value: string;
}) => {
  const context = useContext();

  return (
    <Link
      {...props}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm dark:ring-offset-slate-950 dark:focus-visible:ring-slate-300 dark:data-[state=active]:bg-slate-950 dark:data-[state=active]:text-slate-50",
        props.className,
      )}
      data-state={context.selected === props.value ? "active" : "inactive"}
      href={context.hrefFor(props.value)}
      scroll={false}
      shallow={true}
    />
  );
};

export function TabsContent(props: {
  children: React.ReactNode;
  className?: string;
  value: string;
}) {
  const context = useContext();

  if (context.selected !== props.value) {
    return null;
  }

  return (
    <div
      {...props}
      className={cn(
        "mt-2 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 dark:ring-offset-slate-950 dark:focus-visible:ring-slate-300",
        props.className,
      )}
    />
  );
}
