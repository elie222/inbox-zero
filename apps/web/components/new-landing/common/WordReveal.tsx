import { BlurFade } from "@/components/new-landing/common/BlurFade";
import { cx } from "class-variance-authority";

interface WordRevealProps {
  children?: string;
  words?: React.ReactNode[];
  duration?: number;
  delay?: number;
  spaceBetween?: string;
}

export function WordReveal({
  children,
  words,
  duration = 0.06,
  delay = 0,
  spaceBetween = "w-3",
}: WordRevealProps) {
  const wordsToReveal = children ? children.split(" ") : words || [];

  return (
    <>
      {wordsToReveal.map((word, index) => (
        <BlurFade
          delay={delay + duration * index}
          inView
          as="span"
          key={`${word}-${index}`}
        >
          {word}
          {index < wordsToReveal.length - 1 && (
            <span className={cx("inline-block", spaceBetween)}> </span>
          )}
        </BlurFade>
      ))}
    </>
  );
}
