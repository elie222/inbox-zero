"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { KnowledgeBase } from "./KnowledgeBase";

export function KnowledgeDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Manage Draft Knowledge
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Draft Knowledge</DialogTitle>
          <DialogDescription>
            This is used to help the assistant draft replies.
          </DialogDescription>
        </DialogHeader>
        <KnowledgeBase />
      </DialogContent>
    </Dialog>
  );
}
