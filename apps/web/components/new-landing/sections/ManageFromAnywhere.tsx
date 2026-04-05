import Image from "next/image";
import { Globe } from "lucide-react";
import { BlurFade } from "@/components/new-landing/common/BlurFade";
import { Card } from "@/components/new-landing/common/Card";
import { CardWrapper } from "@/components/new-landing/common/CardWrapper";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  SectionHeading,
  SectionSubtitle,
} from "@/components/new-landing/common/Typography";

const platforms = [
  { name: "Slack", src: "/images/slack.svg" },
  { name: "Telegram", src: "/images/telegram.svg" },
  { name: "Teams", src: "/images/teams.png", comingSoon: true },
] as const;

export function ManageFromAnywhere() {
  return (
    <Section>
      <SectionHeading>Your inbox, wherever you work</SectionHeading>
      <SectionSubtitle>
        Read emails, draft replies, and manage your inbox from Slack, Telegram,
        or the web — without switching apps.
      </SectionSubtitle>
      <SectionContent className="flex justify-center">
        <BlurFade inView>
          <div className="grid grid-cols-2 sm:grid-cols-4 items-start justify-items-center gap-6 sm:gap-10">
            {platforms.map((platform) => (
              <PlatformIcon key={platform.name} {...platform} />
            ))}
            <PlatformIcon name="Web" icon={<WebIcon />} />
          </div>
        </BlurFade>
      </SectionContent>
    </Section>
  );
}

function PlatformIcon({
  name,
  src,
  icon,
  comingSoon,
}: {
  name: string;
  src?: string;
  icon?: React.ReactNode;
  comingSoon?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <CardWrapper padding="xs-2" rounded="full">
        <Card variant="circle">
          <div className="p-3">
            {src ? <Image src={src} alt={name} width={56} height={56} /> : icon}
          </div>
        </Card>
      </CardWrapper>
      <span className="text-sm font-medium text-gray-500">{name}</span>
      {comingSoon && (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400">
          Coming soon
        </span>
      )}
    </div>
  );
}

function WebIcon() {
  return <Globe className="size-14 text-gray-600" strokeWidth={1.5} />;
}
