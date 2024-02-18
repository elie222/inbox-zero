import { Tooltip } from "@/components/Tooltip";
import { Button } from "@/components/ui/button";

export function ButtonGroup(props: {
  buttons: {
    text?: string;
    icon?: React.ReactNode;
    tooltip?: string;
    onClick: () => void;
  }[];
}) {
  return (
    <span className="isolate inline-flex rounded-md bg-white">
      {props.buttons.map((button) => (
        <Tooltip key={button.text || button.tooltip} content={button.tooltip}>
          <Button onClick={button.onClick} size="icon" variant="ghost">
            {button.icon}
            {button.text}
          </Button>
        </Tooltip>
      ))}
    </span>
  );
}
