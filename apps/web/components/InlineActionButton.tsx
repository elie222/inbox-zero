import { Button, type ButtonProps } from "@/components/ui/button";

export function InlineActionButton(
  props: Pick<ButtonProps, "children" | "onClick" | "disabled">,
) {
  return <Button variant="ghostMuted" size="inline" {...props} />;
}
