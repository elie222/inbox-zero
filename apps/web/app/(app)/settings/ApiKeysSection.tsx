import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { FormSection, FormSectionLeft } from "@/components/Form";
import prisma from "@/utils/prisma";
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
} from "@/app/(app)/settings/ApiKeysCreateForm";
import { Card } from "@/components/ui/card";

export async function ApiKeysSection() {
  const session = await auth();
  const userId = session?.user.id;
  if (!userId) throw new Error("Not authenticated");

  const apiKeys = await prisma.apiKey.findMany({
    where: { userId, isActive: true },
    select: {
      id: true,
      name: true,
      createdAt: true,
    },
  });

  return (
    <FormSection>
      <FormSectionLeft
        title="API keys"
        description="Create an API key to access the Inbox Zero API. Do not share your API key with others, or expose it in the browser or other client-side code."
      />

      <div className="col-span-2 space-y-4">
        {apiKeys.length > 0 ? (
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
                {apiKeys.map((apiKey) => (
                  <TableRow key={apiKey.id}>
                    <TableCell>{apiKey.name}</TableCell>
                    <TableCell>{apiKey.createdAt.toLocaleString()}</TableCell>
                    <TableCell>
                      <ApiKeysDeactivateButton id={apiKey.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ) : null}

        <ApiKeysCreateButtonModal />
      </div>
    </FormSection>
  );
}
