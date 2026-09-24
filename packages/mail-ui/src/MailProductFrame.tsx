import type { CSSProperties, ReactNode, Ref } from "react";

export type MailProductFrameProps = {
  sidebar?: ReactNode;
  children: ReactNode;
  accountSwitcher?: ReactNode;
  floating?: ReactNode;
  dialogs?: ReactNode;
  className?: string;
  bodyClassName?: string;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
  sidebarClassName?: string;
  sidebarStyle?: CSSProperties;
  sidebarScopeRef?: Ref<HTMLDivElement>;
};

export function MailProductFrame({
  sidebar,
  children,
  accountSwitcher,
  floating,
  dialogs,
  className = "flex min-h-0 flex-1 flex-col bg-background",
  bodyClassName = "flex min-h-0 flex-1",
  style,
  bodyStyle,
  sidebarClassName = "hidden lg:contents",
  sidebarStyle,
  sidebarScopeRef,
}: MailProductFrameProps) {
  return (
    <div className={className} style={style}>
      <div className={bodyClassName} style={bodyStyle}>
        {sidebar ? (
          <div
            ref={sidebarScopeRef}
            className={sidebarClassName}
            style={sidebarStyle}
          >
            {sidebar}
          </div>
        ) : null}
        {children}
      </div>
      {accountSwitcher}
      {floating}
      {dialogs}
    </div>
  );
}
