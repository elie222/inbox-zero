import { useAccount } from "@/providers/EmailAccountProvider";
import { useUser } from "@/hooks/useUser";

export function useCurrentOrganization() {
  const { emailAccountId, emailAccount } = useAccount();
  const { data: user } = useUser();
  const currentEmailAccountId = emailAccount?.id || emailAccountId;

  const member = user?.members?.find(
    (m) => m.emailAccountId === currentEmailAccountId,
  );

  if (!member?.organizationId) return;

  return {
    id: member.organizationId,
    name: member.organization?.name,
  };
}
