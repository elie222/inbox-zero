import Image from "next/image";

export function OnboardingImagePreview({
  src,
  alt,
  width,
  height,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
}) {
  return (
    <div className="ml-auto text-muted-foreground rounded-tl-2xl rounded-bl-2xl pl-4 py-4 bg-slate-50 border-y border-l border-slate-200 overflow-hidden max-h-[600px]">
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="rounded-tl-xl rounded-bl-xl border-y border-l border-slate-200"
      />
    </div>
  );
}
