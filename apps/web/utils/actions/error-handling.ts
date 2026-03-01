import { toastError } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";

type SafeActionError = Parameters<typeof getActionErrorMessage>[0];

type SettingActionErrorOptions = {
  mutate?: () => void;
  prefix?: string;
  defaultMessage?: string;
};

export function showSettingActionError({
  error,
  mutate,
  prefix,
  defaultMessage = "There was an error",
}: SettingActionErrorOptions & { error: SafeActionError }) {
  mutate?.();
  toastError({
    description: getActionErrorMessage(error, {
      fallback: defaultMessage,
      prefix,
    }),
  });
}

export function createSettingActionErrorHandler(
  options: SettingActionErrorOptions,
) {
  return ({ error }: { error: SafeActionError }) =>
    showSettingActionError({ error, ...options });
}
