import { cn } from "@/utils";

interface WordRevealProps {
  children?: string;
  spaceBetween?: string;
  words?: readonly React.ReactNode[];
}

export function WordReveal({
  children,
  words,
  spaceBetween = "w-3",
}: WordRevealProps) {
  const wordsToReveal = children ? children.split(" ") : words || [];

  return (
    <>
      {wordsToReveal.map((word, index) => (
        <span className="inline-block" key={index}>
          {word}
          {index < wordsToReveal.length - 1 && (
            <span className={cn("inline-block", spaceBetween)}> </span>
          )}
        </span>
      ))}
    </>
  );
}
