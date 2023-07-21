import React from "react";
import Tippy from "@tippyjs/react";
import "tippy.js/dist/tippy.css"; // optional

interface TooltipProps {
  children: React.ReactElement;
  content?: string;
  useRef?: boolean;
}

export const Tooltip = (props: TooltipProps) => {
  return props.children; // TODO
  if (!props.content) return props.children;

  // See: https://github.com/atomiks/tippyjs-react#component-children
  // Avoids button in button warning
  if (props.useRef)
    return <Tippy content={props.content}>{props.children}</Tippy>;

  return (
    <Tippy content={props.content}>
      <button>{props.children}</button>
    </Tippy>
  );
};
