import { Tooltip } from "@/components/Tooltip";
import clsx from "clsx";

export function ButtonGroup(props: {
  buttons: {
    text?: string;
    icon?: React.ReactNode;
    tooltip?: string;
    onClick: () => void;
  }[];
}) {
  const lastIndex = props.buttons.length - 1;

  return (
    <span className="isolate inline-flex rounded-md shadow-sm">
      {props.buttons.map((button, index) => (
        <Tooltip content={button.tooltip} key={button.text}>
          <Button
            text={button.text}
            icon={button.icon}
            position={
              index === 0 ? "left" : index === lastIndex ? "right" : "center"
            }
            onClick={button.onClick}
          />
        </Tooltip>
      ))}
    </span>
  );
}

function Button(props: {
  position: "left" | "center" | "right";
  text?: string;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={clsx(
        "relative inline-flex items-center bg-white px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-10",
        props.position === "left" && "rounded-l-md",
        props.position === "right" && "rounded-r-md",
        (props.position === "center" || props.position === "right") && "-ml-px"
      )}
    >
      {props.icon}
      {props.text}
    </button>
  );
}
