import { Button } from "@/components/new-landing/common/Button";
import { Paragraph } from "@/components/new-landing/common/Typography";
import { Chat } from "@/components/new-landing/icons/Chat";

interface CallToActionProps {
  text?: string;
}

export function CallToAction({ text = "Get started" }: CallToActionProps) {
  return (
    <div className="flex items-center gap-4 justify-center">
      <Button size="lg">{text}</Button>
      <Paragraph className="text-sm">or</Paragraph>
      <Button variant="secondary-two" size="lg" icon={<Chat />}>
        Talk to sales
      </Button>
    </div>
  );
}
