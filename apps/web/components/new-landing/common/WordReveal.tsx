import { BlurFade } from "@/components/new-landing/common/BlurFade";

interface WordRevealProps {
  children?: string;
  words?: React.ReactNode[];
  duration?: number;
  delay?: number;
}

export function WordReveal({
  children,
  words,
  duration = 0.06,
  delay = 0,
}: WordRevealProps) {
  const wordsToReveal = children ? children.split(" ") : words || [];

  return (
    <>
      {wordsToReveal.map((word, index) => (
        <BlurFade delay={delay + duration * index} inView as="span" key={index}>
          {word}
          {index < wordsToReveal.length - 1 && (
            <span className="inline-block w-3"> </span>
          )}
        </BlurFade>
      ))}
    </>
  );
}
