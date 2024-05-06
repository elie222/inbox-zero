"use client";

import useSWR from "swr";
import { LoadingContent } from "@/components/LoadingContent";
import { Modal, useModal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UpdateRuleForm } from "@/app/(app)/automation/RuleModal";
import { GroupRulesResponse } from "@/app/api/user/group/[groupId]/rules/route";
import { RuleType } from "@prisma/client";

export function ViewGroupRulesButton({
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
        Rules
      </Button>
      <Modal
        isOpen={isModalOpen}
        hideModal={closeModal}
        title={name}
        size="4xl"
      >
        <div className="mt-4">
          <ViewGroupRules groupId={groupId} closeModal={closeModal} />
        </div>
      </Modal>
    </>
  );
}

function ViewGroupRules({
  groupId,
  closeModal,
}: {
  groupId: string;
  closeModal: () => void;
}) {
  const { data, isLoading, error, mutate } = useSWR<GroupRulesResponse>(
    `/api/user/group/${groupId}/rules`,
  );

  return (
    <div>
      <div className="mt-4">
        <LoadingContent
          loading={!data && isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-24 rounded" />}
        >
          <UpdateRuleForm
            rule={
              data?.rule || {
                name: "",
                automate: true,
                runOnThreads: true,
                groupId,
                type: RuleType.GROUP,
              }
            }
            onSuccess={closeModal}
            refetchRules={mutate}
          />
        </LoadingContent>
      </div>
    </div>
  );
}
