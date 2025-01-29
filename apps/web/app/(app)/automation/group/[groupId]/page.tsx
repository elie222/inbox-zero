import { ViewGroup } from "@/app/(app)/automation/group/ViewGroup";
import { Container } from "@/components/Container";

// Not in use anymore. Could delete this.
export default function GroupPage({ params }: { params: { groupId: string } }) {
  return (
    <div className="mt-4">
      <Container>
        <ViewGroup groupId={params.groupId} />
      </Container>
    </div>
  );
}
