import { Button } from "@/components/new-landing/common/Button";
import { Chat } from "@/components/new-landing/icons/Chat";
import { cx } from "class-variance-authority";

interface CallToActionProps {
  text?: string;
  className?: string;
}

export function CallToAction({
  text = "Get started",
  className,
}: CallToActionProps) {
  return (
    <div className={cx("flex items-center gap-4 justify-center", className)}>
      <Button size="lg">{text}</Button>
      <Button variant="secondary-two" size="lg" icon={<Chat />}>
        Talk to sales
      </Button>
    </div>
  );
}
