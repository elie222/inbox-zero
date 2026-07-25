"use client";

import { PinnedPage } from "@/components/PinnedPage";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { TasksList } from "./TasksList";

export default function TasksPage() {
  return (
    <PinnedPage>
      <PermissionsCheck />
      <TasksList />
    </PinnedPage>
  );
}
