import React from "react";
import clsx from "clsx";

interface ContainerProps {
  children: React.ReactNode;
  size?: "lg" | "2xl" | "4xl" | "6xl";
}

export const Container = (props: ContainerProps) => {
  const { children, size = "4xl" } = props;

  return (
    <div
      className={clsx("mx-auto w-full px-4", {
        "max-w-lg": size === "lg",
        "max-w-2xl": size === "2xl",
        "max-w-4xl": size === "4xl",
        "max-w-6xl": size === "6xl",
      })}
    >
      {children}
    </div>
  );
};
