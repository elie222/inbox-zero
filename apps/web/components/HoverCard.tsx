import {
  HoverCard as HoverCardUi,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/utils";

export function HoverCard(props: {
  children: React.ReactNode;
  content: React.ReactNode;
  className?: string;
}) {
  return (
    <HoverCardUi openDelay={100} closeDelay={100}>
      <HoverCardTrigger asChild>{props.children}</HoverCardTrigger>
      <HoverCardContent
        className={cn("overflow-hidden", props.className)}
        align="start"
        side="right"
      >
        {props.content}
      </HoverCardContent>
    </HoverCardUi>
  );
}
