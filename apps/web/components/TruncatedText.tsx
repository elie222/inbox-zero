"use client";

import { useRef, useEffect, useLayoutEffect, useState } from "react";
import {
  Tooltip as ShadcnTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils";

export function TruncatedText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  useLayoutEffect(() => {
    if (textRef.current) {
      const isOverflowing =
        textRef.current.scrollWidth > textRef.current.clientWidth;
      setHasOverflow(isOverflowing);
    }
  });

  useEffect(() => {
    const checkOverflow = () => {
      if (textRef.current) {
        const isOverflowing =
          textRef.current.scrollWidth > textRef.current.clientWidth;
        setHasOverflow(isOverflowing);
      }
    };

    window.addEventListener("resize", checkOverflow);
    return () => window.removeEventListener("resize", checkOverflow);
  }, []);

  const content = (
    <span ref={textRef} className={cn("block truncate", className)}>
      {text}
    </span>
  );

  if (!hasOverflow) {
    return content;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <ShadcnTooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs whitespace-pre-wrap break-words">{text}</p>
        </TooltipContent>
      </ShadcnTooltip>
    </TooltipProvider>
  );
}
