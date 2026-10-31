"use client";

import { DomainIcon } from "@/components/charts/DomainIcon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useContactPhoto } from "@/hooks/useContactPhoto";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  extractDomainFromEmail,
  getInitials,
  isPublicEmailDomain,
} from "@/utils/email";

export function SenderIcon({
  email,
  name,
  size = 20,
}: {
  email: string;
  name?: string | null;
  size?: number;
}) {
  const domain = extractDomainFromEmail(email) || email;

  // A mailbox provider's logo says nothing about who the sender is.
  if (!isPublicEmailDomain(domain))
    return <DomainIcon domain={domain} size={size} variant="circular" />;

  return <PersonAvatar email={email} name={name} size={size} />;
}

function PersonAvatar({
  email,
  name,
  size,
}: {
  email: string;
  name?: string | null;
  size: number;
}) {
  const { emailAccountId } = useAccount();
  const photoUrl = useContactPhoto({ email, emailAccountId });

  return (
    <Avatar
      aria-hidden
      className="shrink-0"
      style={{ width: size, height: size }}
    >
      <AvatarImage alt="" src={photoUrl} referrerPolicy="no-referrer" />
      <AvatarFallback
        className="bg-muted font-semibold text-muted-foreground"
        style={{ fontSize: Math.round(size * 0.375) }}
      >
        {getInitials(name || email)}
      </AvatarFallback>
    </Avatar>
  );
}
