"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
const SKELETON_ROW_COUNT = 10;

function SkeletonCheckbox() {
  return <Skeleton className="h-5 w-5 rounded-md" />;
}

function SkeletonDesktopRow() {
  return (
    <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
      <TableCell className="pr-0">
        <SkeletonCheckbox />
      </TableCell>
      <TableCell className="max-w-[250px] py-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="flex flex-col gap-1">
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-3 w-40 rounded" />
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-8" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-10" />
      </TableCell>
      <TableCell className="p-1">
        <div className="flex justify-end items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      </TableCell>
    </TableRow>
  );
}

export function BulkUnsubscribeDesktopSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pr-0">
            <SkeletonCheckbox />
          </TableHead>
          <TableHead>
            <span className="text-sm font-medium">From</span>
          </TableHead>
          <TableHead>
            <span className="text-sm font-medium">Emails</span>
          </TableHead>
          <TableHead>
            <span className="text-sm font-medium">Read</span>
          </TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
          <SkeletonDesktopRow key={index} />
        ))}
      </TableBody>
    </Table>
  );
}

