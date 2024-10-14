"use client";

import { Suspense, useState } from "react";
import { OnboardingNextButton } from "@/app/(app)/onboarding/OnboardingNextButton";
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

export function OnboardingBulkUnsubscriber() {
  const [removed, setRemoved] = useState<string[]>([]);

  const rows = [
    {
      email: "test@test.com",
      emails: 39,
      read: 25,
      archived: 10,
    },
    {
      email: "test2@test.com",
      emails: 39,
      read: 25,
      archived: 10,
    },
    {
      email: "test3@test.com",
      emails: 39,
      read: 25,
      archived: 10,
    },
  ];

  return (
    <div className="relative">
      <Card className="overflow-visible">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Emails</TableHead>
              <TableHead>Read</TableHead>
              <TableHead>Archived</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.email}>
                <TableCell>{row.email}</TableCell>
                <TableCell>{row.emails}</TableCell>
                <TableCell>{row.read}%</TableCell>
                <TableCell>{row.archived}%</TableCell>
                <TableCell>
                  <Button
                    disabled={removed.includes(row.email)}
                    onClick={() => {
                      setRemoved((currentRemoved) => [
                        ...currentRemoved,
                        row.email,
                      ]);
                    }}
                  >
                    {removed.includes(row.email)
                      ? "Unsubscribed"
                      : "Unsubscribe"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Suspense>
        <OnboardingNextButton />
      </Suspense>
    </div>
  );
}
