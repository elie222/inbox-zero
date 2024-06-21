import { captureException as sentryCaptureException } from "@sentry/nextjs";

export type ErrorMessage = { error: string; data?: any };
export type ZodError = {
  error: { issues: { code: string; message: string }[] };
};

export function isError(value: any): value is ErrorMessage | ZodError {
  return value?.error;
}

export function isErrorMessage(value: any): value is ErrorMessage {
  return typeof value?.error === "string";
}

export function captureException(
  error: unknown,
  additionalInfo?: { extra?: Record<string, any> },
) {
  sentryCaptureException(error, additionalInfo);
}

export type ActionError<T = {}> = { error: string } & T;
export type ServerActionResponse<T = {}, S = {}> =
  | ActionError<S>
  | T
  | undefined;

export function isActionError(error: any): error is ActionError {
  return error && "error" in error && error.error;
}
