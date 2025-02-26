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
        "bg-muted text-muted-foreground inline-flex h-10 items-center justify-center rounded-md p-1",
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
        "ring-offset-background focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground inline-flex items-center justify-center rounded-xs px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-xs",
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
        "ring-offset-background focus-visible:ring-ring mt-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden",
        props.className,
      )}
    />
  );
}
