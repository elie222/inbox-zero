"use client";

import useSWR from "swr";
import { GroupItemsResponse } from "@/app/api/user/group/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Modal, useModal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { MessageText } from "@/components/Typography";

export function ViewGroupButton({
  groupId,
  name,
}: {
  groupId: string;
  name: string;
}) {
  const { isModalOpen, openModal, closeModal } = useModal();

  return (
    <>
      <Button size="sm" variant="outline" onClick={openModal}>
        View
      </Button>
      <Modal isOpen={isModalOpen} hideModal={closeModal} title={name}>
        <div className="mt-4">
          <ViewGroup groupId={groupId} name={name} />
        </div>
      </Modal>
    </>
  );
}

function ViewGroup({ groupId, name }: { groupId: string; name: string }) {
  const { data, isLoading, error } = useSWR<GroupItemsResponse>(
    `/api/user/group?groupId=${groupId}`,
  );

  return (
    <div>
      <Button variant="outline">Add</Button>

      <LoadingContent
        loading={!data && isLoading}
        error={error}
        loadingComponent={<Skeleton className="h-24 rounded" />}
      >
        {data && (
          <>
            {data.items.length ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sender</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.name}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            ) : (
              <MessageText className="mt-4">
                There are no senders in this group.
              </MessageText>
            )}
          </>
        )}
      </LoadingContent>
    </div>
  );
}
