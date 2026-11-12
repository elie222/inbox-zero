import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { SendWarning } from "./send-warnings";

export function SendWarningsDialog({
  warnings,
  onDismiss,
  onSendAnyway,
}: {
  warnings: SendWarning[];
  onDismiss: () => void;
  onSendAnyway: () => void;
}) {
  const { i18n } = useLingui();
  return (
    <AlertDialog
      open={warnings.length > 0}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Send anyway?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-1">
              {warnings.map((warning) => (
                <p key={warning.type}>
                  {i18n._(getSendWarningMessage(warning))}
                </p>
              ))}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <Trans>Go back</Trans>
          </AlertDialogCancel>
          <AlertDialogAction onClick={onSendAnyway}>
            <Trans>Send anyway</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function getSendWarningMessage(warning: SendWarning) {
  if (warning.type === "missing-attachment") {
    return msg`You mention an attachment, but nothing is attached.`;
  }
  return msg`There's an unfilled placeholder: ${warning.placeholder}`;
}
