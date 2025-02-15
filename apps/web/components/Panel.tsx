import clsx from "clsx";
import type React from "react";

interface PanelProps {
  children: React.ReactNode;
  title?: string;
  classes?: string;
  full?: boolean;
  white?: boolean;
}

export const Panel = (props: PanelProps) => {
  return (
    <div
      className={clsx(
        "rounded-lg bg-white text-gray-700 shadow",
        !props.full && "px-8 py-7",
        props.classes,
      )}
    >
      {props.title && (
        <h3 className="mb-4 text-lg font-medium leading-6 text-primary">
          {props.title}
        </h3>
      )}
      {props.children}
    </div>
  );
};

export const GradientPanel = (props: PanelProps) => {
  return (
    <div>
      <div className="rounded-lg bg-gradient-to-l from-sky-500 via-indigo-400 to-cyan-400 p-0.5 shadow-md">
        <div
          className={clsx("rounded-md bg-white text-gray-700", props.classes, {
            "p-4 sm:p-6 md:px-8 md:py-7": !props.full,
          })}
        >
          {props.title && (
            <h3 className="mb-4 text-lg font-medium leading-6 text-primary">
              {props.title}
            </h3>
          )}
          {props.children}
        </div>
      </div>
    </div>
  );
};
