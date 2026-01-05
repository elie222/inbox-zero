"use client";

import { useState, useEffect } from "react";
import type { PortableTextBlock } from "@portabletext/react";
import { extractTextFromPortableTextBlock, slugify } from "@/utils/text";

interface TableOfContentsProps {
  body: PortableTextBlock[];
}

export function TableOfContents({ body }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const headings = body.filter(
    (block) => block.style === "h2",
    // (block) => block.style === "h2" || block.style === "h3",
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-50% 0% -50% 0%" },
    );

    for (const heading of headings) {
      const text = extractTextFromPortableTextBlock(heading);
      const id = slugify(text);
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }

    return () => observer.disconnect();
  }, [headings]);

  return (
    <nav className="sticky top-24 overflow-y-auto">
      <h2 className="mb-4 text-lg font-semibold">Table of Contents</h2>
      <ul className="space-y-2">
        {headings.map((heading, index) => {
          const text = extractTextFromPortableTextBlock(heading);
          const id = slugify(text);
          return (
            <li key={index} className={heading.style === "h3" ? "ml-4" : ""}>
              <a
                href={`#${id}`}
                className={`text-slate-700 hover:underline ${
                  activeId === id ? "font-bold text-blue-600" : ""
                }`}
              >
                {text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
