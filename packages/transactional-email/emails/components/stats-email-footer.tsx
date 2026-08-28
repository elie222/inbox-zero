import { Link, Section, Text } from "@react-email/components";

export function StatsEmailFooter({
  baseUrl,
  unsubscribeToken,
}: {
  baseUrl: string;
  unsubscribeToken: string;
}) {
  return (
    <Section>
      <Text>
        You're receiving this email because you're subscribed to Inbox Zero
        stats updates. You can change this in your{" "}
        <Link
          href={`${baseUrl}/settings#email-updates`}
          className="text-[15px]"
        >
          settings
        </Link>
        .
      </Text>

      <Link
        href={`${baseUrl}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`}
        className="text-[15px]"
      >
        Unsubscribe from emails like this
      </Link>
    </Section>
  );
}
