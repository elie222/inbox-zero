import { Button } from "@/components/Button";
// import { Checkbox } from "@/components/Checkbox";
import React from "react";

export function GroupHeading(props: {
  leftContent: React.ReactNode;
  buttons?: { label: string; loading?: boolean; onClick: () => void }[];
}) {
  return (
    <div className="flex max-w-full flex-wrap items-center gap-x-6 px-4 sm:flex-nowrap sm:px-6">
      {/* <div className="border-l-4 border-transparent">
        <Checkbox checked onChange={() => {}} />
      </div> */}

      <h1 className="text-base font-semibold leading-7 text-gray-900">
        {props.leftContent}
      </h1>

      <div className="ml-auto flex items-center gap-x-1 py-2">
        {props.buttons?.map((button) => (
          <Button
            key={button.label}
            size="md"
            onClick={button.onClick}
            loading={button.loading}
          >
            {button.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
