"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ApiKeysCreateButtonModal,
  ApiKeysDeactivateButton,
} from "@/app/(app)/[emailAccountId]/settings/ApiKeysCreateForm";
import { Card } from "@/components/ui/card";
import { useApiKeys } from "@/hooks/useApiKeys";
import { LoadingContent } from "@/components/LoadingContent";

export function ApiKeysSection() {
  const { data, isLoading, error, mutate } = useApiKeys();

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-medium">API keys</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Create an API key to access the Inbox Zero API. Do not share your API
          key with others, or expose it in the browser or other client-side
          code.
        </p>
      </div>

      <LoadingContent loading={isLoading} error={error}>
        <div className="space-y-4">
          {data && data.apiKeys.length > 0 ? (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.apiKeys.map((apiKey) => (
                    <TableRow key={apiKey.id}>
                      <TableCell>{apiKey.name}</TableCell>
                      <TableCell>{apiKey.createdAt.toLocaleString()}</TableCell>
                      <TableCell>
                        <ApiKeysDeactivateButton
                          id={apiKey.id}
                          mutate={mutate}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : null}

          <ApiKeysCreateButtonModal mutate={mutate} />
        </div>
      </LoadingContent>
    </section>
  );
}
