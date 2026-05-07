import type { FieldError } from "react-hook-form";
import { ErrorMessage, ExplainText, Label } from "./Input";
import { Tooltip } from "@/components/Tooltip";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import { Switch } from "@/components/ui/switch";

export interface ToggleProps {
  disabled?: boolean;
  disabledTooltipText?: string;
  enabled: boolean;
  error?: FieldError;
  explainText?: string;
  label?: string;
  labelRight?: string;
  name: string;
  onChange: (enabled: boolean) => void;
  tooltipText?: string;
}

export const Toggle = (props: ToggleProps) => {
  const {
    label,
    labelRight,
    tooltipText,
    enabled,
    onChange,
    disabled,
    disabledTooltipText,
  } = props;

  const switchComponent = (
    <Switch checked={enabled} onCheckedChange={onChange} disabled={disabled} />
  );

  return (
    <div>
      <div className="flex items-center">
        {label && (
          <span className="mr-3 flex items-center gap-1 text-nowrap">
            <Label name={props.name} label={label} />
            {tooltipText && <TooltipExplanation text={tooltipText} />}
          </span>
        )}
        {disabled && disabledTooltipText ? (
          <Tooltip content={disabledTooltipText}>
            <span className="inline-flex cursor-not-allowed">
              {switchComponent}
            </span>
          </Tooltip>
        ) : (
          switchComponent
        )}
        {labelRight && (
          <span className="ml-3 flex items-center gap-1 text-nowrap">
            <Label name={props.name} label={labelRight} />
            {tooltipText && <TooltipExplanation text={tooltipText} />}
          </span>
        )}
      </div>
      {props.explainText ? (
        <ExplainText>{props.explainText}</ExplainText>
      ) : null}
      {props.error?.message ? (
        <ErrorMessage message={props.error?.message} />
      ) : null}
    </div>
  );
};
