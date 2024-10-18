import { ViewGroup } from "@/app/(app)/automation/group/ViewGroup";
import { Container } from "@/components/Container";

export default function GroupPage({ params }: { params: { groupId: string } }) {
  return (
    <div className="mt-4">
      <Container>
        <ViewGroup groupId={params.groupId} />
      </Container>
    </div>
  );
}
