import { AlertCircle, TerminalIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function AlertBasic(props: {
  title: string;
  description: string;
  icon?: React.ReactNode;
  variant?: "default" | "destructive" | "success";
}) {
  return (
    <Alert variant={props.variant}>
      {props.icon || <TerminalIcon className="h-4 w-4" />}
      <AlertTitle>{props.title}</AlertTitle>
      <AlertDescription>{props.description}</AlertDescription>
    </Alert>
  );
}

export function AlertError(props: { title: string; description: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{props.title}</AlertTitle>
      <AlertDescription className="whitespace-pre-wrap">
        {props.description}
      </AlertDescription>
    </Alert>
  );
}
