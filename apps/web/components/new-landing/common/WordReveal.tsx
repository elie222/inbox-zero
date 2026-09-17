import { cn } from "@/utils";
import { HeroReveal } from "@/components/new-landing/common/HeroReveal";

interface WordRevealProps {
  children?: string;
  delay?: number;
  duration?: number;
  spaceBetween?: string;
  words?: readonly React.ReactNode[];
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
        <HeroReveal as="span" blur delay={delay + duration * index} key={index}>
          {word}
          {index < wordsToReveal.length - 1 && (
            <span className={cn("inline-block", spaceBetween)}> </span>
          )}
        </HeroReveal>
      ))}
    </>
  );
}
