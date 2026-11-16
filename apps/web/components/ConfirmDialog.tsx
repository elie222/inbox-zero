"use client";

import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ConfirmDialogProps {
  cancelText?: string;
  confirmText?: string;
  description: string;
  onConfirm: () => Promise<void> | void;
  title: string;
  trigger: ReactNode;
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  onConfirm,
  confirmText,
  cancelText,
}: ConfirmDialogProps) {
  const { t } = useLingui();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelText ?? t`Cancel`}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {confirmText ?? t`Delete`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
