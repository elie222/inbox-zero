import { Button } from "@/components/Button";
// import { Checkbox } from "@/components/Checkbox";
import type React from "react";

export function GroupHeading(props: {
  leftContent: React.ReactNode;
  buttons?: { label: string; loading?: boolean; onClick: () => void }[];
}) {
  return (
    <div className="content-container flex max-w-full flex-wrap items-center gap-x-6 sm:flex-nowrap">
      {/* <div className="border-l-4 border-transparent">
        <Checkbox checked onChange={() => {}} />
      </div> */}

      <h1 className="text-base font-semibold leading-7 text-primary">
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
