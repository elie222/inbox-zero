import { Button, type ButtonProps } from "@/components/ui/button";

export function InlineActionButton(
  props: Pick<ButtonProps, "children" | "onClick" | "disabled" | "aria-label">,
) {
  return <Button variant="ghostMuted" size="inline" {...props} />;
}
