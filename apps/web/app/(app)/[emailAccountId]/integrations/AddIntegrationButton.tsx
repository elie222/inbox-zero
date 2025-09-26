"use client";

import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogContent,
} from "@/components/ui/dialog";

export function AddIntegrationButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button Icon={PlusIcon}>Add Integration</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Integration</DialogTitle>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
