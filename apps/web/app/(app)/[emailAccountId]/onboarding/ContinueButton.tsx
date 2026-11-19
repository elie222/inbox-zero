import { Trans } from "@lingui/react/macro";
import { ArrowRightIcon } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

export function ContinueButton(props: ButtonProps) {
  return (
    <Button size="sm" {...props}>
      <Trans>Continue</Trans> <ArrowRightIcon className="size-4 ml-2" />
    </Button>
  );
}
