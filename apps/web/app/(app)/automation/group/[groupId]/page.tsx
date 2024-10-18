"use client";

import { useRouter } from "next/navigation";
import { ViewGroup } from "@/app/(app)/automation/group/ViewGroup";
import { Container } from "@/components/Container";

export default function GroupPage({ params }: { params: { groupId: string } }) {
  const router = useRouter();

  return (
    <div className="mt-4">
      <Container>
        <ViewGroup
          groupId={params.groupId}
          onDelete={() => {
            router.push("/automation?tab=groups");
          }}
        />
      </Container>
    </div>
  );
}
