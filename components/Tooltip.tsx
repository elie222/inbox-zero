import React from "react";
import Tippy from "@tippyjs/react";
import "tippy.js/dist/tippy.css"; // optional

interface TooltipProps {
  children: React.ReactNode;
  content?: string;
}

export const Tooltip = (props: TooltipProps) => {
  if (!props.content) return props.children;
  return (
    <Tippy content={props.content}>
      <button>{props.children}</button>
    </Tippy>
  );
};
