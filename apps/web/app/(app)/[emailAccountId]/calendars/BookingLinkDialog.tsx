import { useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/utils";

export function BookingLinkDialog({
  title,
  description,
  navigation,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  navigation?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const descriptionId = useId();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          "grid max-w-xl gap-0 p-0 sm:rounded-2xl",
          navigation
            ? "grid-rows-[auto_auto_1fr_auto]"
            : "grid-rows-[auto_1fr_auto]",
        )}
        hideCloseButton
        aria-describedby={description ? descriptionId : undefined}
      >
        <div className="flex items-start justify-between gap-3 border-b px-6 pb-4 pt-5">
          <div>
            <DialogTitle className="text-xl font-medium">{title}</DialogTitle>
            {description && (
              <DialogDescription
                id={descriptionId}
                className="mt-1 font-mono text-xs"
              >
                {description}
              </DialogDescription>
            )}
          </div>
          <DialogClose asChild>
            <Button variant="ghostMuted" size="icon2xs" aria-label="Close">
              <X className="size-4" />
            </Button>
          </DialogClose>
        </div>
        {navigation}
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function BookingLinkDialogFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2 border-t px-6 py-3">
      {children}
    </div>
  );
}
