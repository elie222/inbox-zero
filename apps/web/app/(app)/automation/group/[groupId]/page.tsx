"use client";
import { use } from "react";

import { useRouter } from "next/navigation";
import { ViewGroup } from "@/app/(app)/automation/group/ViewGroup";
import { Container } from "@/components/Container";

export default function GroupPage(props: {
  params: Promise<{ groupId: string }>;
}) {
  const params = use(props.params);
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
