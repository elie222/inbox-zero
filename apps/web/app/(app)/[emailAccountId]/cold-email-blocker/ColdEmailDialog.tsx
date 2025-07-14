"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ColdEmailContent } from "./ColdEmailContent";

interface ColdEmailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ColdEmailDialog({ isOpen, onClose }: ColdEmailDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cold Email Blocker</DialogTitle>
        </DialogHeader>

        <ColdEmailContent isInset={false} searchParam="cold-email-blocker" />
      </DialogContent>
    </Dialog>
  );
}
