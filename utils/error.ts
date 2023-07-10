// import * as Sentry from '@sentry/nextjs';

export type ErrorMessage = { message: string; data?: any };

export function isErrorMessage(value: any): value is ErrorMessage {
  return typeof value?.message === "string";
}

export function captureException(error: unknown) {
  // Sentry.captureException(error);
}
