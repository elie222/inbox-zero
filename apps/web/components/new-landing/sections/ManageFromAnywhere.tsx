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

const platforms: {
  name: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
}[] = [
  {
    name: "Slack",
    icon: <Image src="/images/slack.svg" alt="Slack" width={56} height={56} />,
  },
  {
    name: "Telegram",
    icon: (
      <Image src="/images/telegram.svg" alt="Telegram" width={56} height={56} />
    ),
  },
  {
    name: "Teams",
    icon: <Image src="/images/teams.png" alt="Teams" width={56} height={56} />,
    comingSoon: true,
  },
  {
    name: "Web",
    icon: <Globe className="size-10 text-gray-600" strokeWidth={1.5} />,
  },
];

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
          <div className="flex items-start gap-6 sm:gap-10">
            {platforms.map((platform) => (
              <PlatformIcon key={platform.name} {...platform} />
            ))}
          </div>
        </BlurFade>
      </SectionContent>
    </Section>
  );
}

function PlatformIcon({
  name,
  icon,
  comingSoon,
}: {
  name: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <CardWrapper padding="xs-2" rounded="full">
        <Card variant="circle">
          <div className="flex size-20 items-center justify-center">{icon}</div>
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
