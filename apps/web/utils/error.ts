// import * as Sentry from '@sentry/nextjs';

export type ErrorMessage = { error: string; data?: any };

export function isErrorMessage(value: any): value is ErrorMessage {
  return typeof value?.error === "string";
}

export function captureException(error: unknown) {
  // Sentry.captureException(error);
}
