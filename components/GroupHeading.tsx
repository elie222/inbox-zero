import { Button } from "@/components/Button";
import React from "react";

export function GroupHeading(props: {
  leftContent: React.ReactNode;
  buttons: { label: string; loading?: boolean; onClick: () => void }[];
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-6 px-4 sm:flex-nowrap sm:px-6 lg:px-8">
        <h1 className="text-base font-semibold leading-7 text-gray-900">
          {props.leftContent}
        </h1>

        <div className="ml-auto flex items-center gap-x-1">
          {props.buttons.map((button) => (
            <Button
              key={button.label}
              size="sm"
              color="black"
              onClick={button.onClick}
              loading={button.loading}
            >
              {button.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
