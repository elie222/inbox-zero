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
import { Card, CardContent, CardHeader } from "@/components/ui/card";

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

function SkeletonMobileCard() {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-48 mt-1" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-6 w-full rounded-full" />
          <Skeleton className="h-6 w-full rounded-full" />
          <Skeleton className="h-6 w-full rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-9 w-full rounded" />
          <Skeleton className="h-9 w-full rounded" />
          <Skeleton className="h-9 w-full rounded" />
          <Skeleton className="h-9 w-full rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

export function BulkUnsubscribeMobileSkeleton() {
  return (
    <div className="mx-2 mt-2 grid gap-2">
      {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
        <SkeletonMobileCard key={index} />
      ))}
    </div>
  );
}
