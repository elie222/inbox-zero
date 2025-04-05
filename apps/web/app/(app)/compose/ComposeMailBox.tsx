import MultiEmailInput from "@/app/(app)/compose/MultiEmailInput";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";

enum CarbonCopyType {
  CC = "cc",
  BCC = "bcc",
}

type ComposeMailBoxProps = {
  to: string;
  cc?: string;
  bcc?: string;
  register: any;
  errors?: any;
};

export default function ComposeMailBox(props: ComposeMailBoxProps) {
  const { register, to, errors } = props;

  const [carbonCopy, setCarbonCopy] = useState({
    cc: false,
    bcc: false,
  });

  const showCC = carbonCopy.cc;
  const showBCC = carbonCopy.bcc;

  const toggleCarbonCopy = (type: CarbonCopyType) => {
    setCarbonCopy((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  const moveToggleButtonsToNewLine =
    carbonCopy.cc || carbonCopy.bcc || (to && to.length > 0);

  return (
    <div className={`relative flex flex-col gap-2 rounded-md border p-2`}>
      <div className="flex items-center justify-between">
        <MultiEmailInput
          register={register}
          name="to"
          label="To"
          className="flex-1"
          error={errors?.to}
        />
        {
          // when no email is present, show the toggle buttons in-line.
          !moveToggleButtonsToNewLine && (
            <ToggleButtonsWrapper
              toggleCarbonCopy={toggleCarbonCopy}
              showCC={carbonCopy.cc}
              showBCC={carbonCopy.bcc}
            />
          )
        }
      </div>
      {showCC && (
        <MultiEmailInput
          name="cc"
          label="Cc"
          register={register}
          error={errors?.cc}
        />
      )}
      {showBCC && (
        <MultiEmailInput
          name="bcc"
          label="Bcc"
          register={register}
          error={errors?.bcc}
        />
      )}
      {/* Moved ToggleButtonsWrapper to a new line below if email is present */}
      {moveToggleButtonsToNewLine && (
        <ToggleButtonsWrapper
          toggleCarbonCopy={toggleCarbonCopy}
          showCC={carbonCopy.cc}
          showBCC={carbonCopy.bcc}
        />
      )}
    </div>
  );
}

const ToggleButtonsWrapper = ({
  toggleCarbonCopy,
  showCC,
  showBCC,
}: {
  toggleCarbonCopy: (type: CarbonCopyType) => void;
  showCC: boolean;
  showBCC: boolean;
}) => {
  return (
    <div className="flex justify-end">
      <div className="flex gap-1">
        {[
          { type: CarbonCopyType.CC, width: "w-8", show: !showCC },
          { type: CarbonCopyType.BCC, width: "w-10", show: !showBCC },
        ]
          .filter((button) => button.show)
          .map((button) => (
            <ToggleButton
              key={button.type}
              label={button.type}
              className={button.width}
              onClick={() => toggleCarbonCopy(button.type)}
            />
          ))}
      </div>
    </div>
  );
};

const ToggleButton = ({
  label,
  className,
  onClick,
}: {
  label: string;
  className?: string;
  onClick: () => void;
}) => {
  return (
    <Button
      size="sm"
      variant={"outline"}
      className={cn(`h-6 w-8 text-[10px]`, className)}
      onClick={onClick}
    >
      {label}
    </Button>
  );
};
