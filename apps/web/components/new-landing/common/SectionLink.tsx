"use client";

export function SectionLink({
  sectionId,
  children,
}: {
  sectionId: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={`#${sectionId}`}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        scrollToSection(sectionId);
      }}
    >
      {children}
    </a>
  );
}

export function scrollToSection(sectionId: string) {
  const target = document.getElementById(sectionId);
  if (!target) return;
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  target.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "start",
  });
  history.replaceState(null, "", `#${sectionId}`);
}
