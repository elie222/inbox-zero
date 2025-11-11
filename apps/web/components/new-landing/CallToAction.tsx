import { Button } from "@/components/new-landing/common/Button";
import { Chat } from "@/components/new-landing/icons/Chat";
import { cx } from "class-variance-authority";

interface CallToActionProps {
  text?: string;
  className?: string;
  includeSalesButton?: boolean;
}

export function CallToAction({
  text = "Get started",
  className,
  includeSalesButton = true,
}: CallToActionProps) {
  return (
    <div
      className={cx(
        "flex justify-center",
        includeSalesButton ? "items-center gap-4" : "",
        className,
      )}
    >
      <Button size="xl">{text}</Button>
      {includeSalesButton ? (
        <Button variant="secondary-two" size="xl" icon={<Chat />}>
          Talk to sales
        </Button>
      ) : null}
    </div>
  );
}
