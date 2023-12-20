import React from "react";
import { AlertCircle, TerminalIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function AlertBasic(props: {
  title: string;
  description: React.ReactNode;
  icon?: React.ReactNode | null;
  variant?: "default" | "destructive" | "success";
  className?: string;
}) {
  return (
    <Alert variant={props.variant} className={props.className}>
      {props.icon === null
        ? null
        : props.icon || <TerminalIcon className="h-4 w-4" />}
      <AlertTitle>{props.title}</AlertTitle>
      <AlertDescription>{props.description}</AlertDescription>
    </Alert>
  );
}

export function AlertWithButton(props: {
  title: string;
  description: React.ReactNode;
  icon?: React.ReactNode;
  variant?: "default" | "destructive" | "success";
  button?: React.ReactNode;
}) {
  return (
    <Alert variant={props.variant} className="pb-3 pt-5">
      {props.icon || <TerminalIcon className="h-4 w-4" />}
      <div className="flex items-center justify-between">
        <div>
          <AlertTitle>{props.title}</AlertTitle>
          <AlertDescription>{props.description}</AlertDescription>
        </div>
        <div>{props.button}</div>
      </div>
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
