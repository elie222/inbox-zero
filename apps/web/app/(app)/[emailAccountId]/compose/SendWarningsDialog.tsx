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
  return (
    <AlertDialog
      open={warnings.length > 0}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send anyway?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-1">
              {warnings.map((warning) => (
                <p key={warning.type}>{getSendWarningMessage(warning)}</p>
              ))}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <AlertDialogAction onClick={onSendAnyway}>
            Send anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function getSendWarningMessage(warning: SendWarning) {
  if (warning.type === "missing-attachment") {
    return "You mention an attachment, but nothing is attached.";
  }
  return `There's an unfilled placeholder: ${warning.placeholder}`;
}
