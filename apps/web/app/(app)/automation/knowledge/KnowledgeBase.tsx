"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState } from "react";
import { Input } from "@/components/Input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createKnowledgeBody,
  type CreateKnowledgeBody,
} from "@/utils/actions/knowledge.validation";
import { createKnowledgeAction } from "@/utils/actions/knowledge";
import { toastError, toastSuccess } from "@/components/Toast";
import { isActionError } from "@/utils/error";

export default function KnowledgeBase() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Add
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Knowledge Base Entry</DialogTitle>
          </DialogHeader>
          <KnowledgeForm closeDialog={() => setIsOpen(false)} />
        </DialogContent>
      </Dialog>

      <Card className="mt-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              {/* <TableHead>Category</TableHead> */}
              <TableHead>Last Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Email Templates</TableCell>
              {/* <TableCell>Communication</TableCell> */}
              <TableCell>2024-03-21</TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm">
                  Edit
                </Button>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Product Documentation</TableCell>
              {/* <TableCell>Technical</TableCell> */}
              <TableCell>2024-03-20</TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm">
                  Edit
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function KnowledgeForm({ closeDialog }: { closeDialog: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateKnowledgeBody>({
    resolver: zodResolver(createKnowledgeBody),
  });

  const onSubmit = async (data: CreateKnowledgeBody) => {
    const result = await createKnowledgeAction(data);

    if (isActionError(result)) {
      toastError({
        title: "Error creating knowledge base entry",
        description: result.error,
      });
      return;
    }

    toastSuccess({
      description: "Knowledge base entry created successfully",
    });
    closeDialog();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        type="text"
        name="title"
        label="Title"
        registerProps={register("title")}
        error={errors.title}
      />
      <Input
        type="text"
        name="content"
        label="Content"
        autosizeTextarea
        rows={5}
        registerProps={register("content")}
        error={errors.content}
      />
      <Button type="submit" loading={isSubmitting}>
        Create
      </Button>
    </form>
  );
}
