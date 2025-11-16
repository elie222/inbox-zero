import { UnicornScene } from "@/components/new-landing/UnicornScene";

interface BannerProps {
  title: React.ReactNode;
  children: React.ReactNode;
}

export function Banner({ title, children }: BannerProps) {
  return (
    <div className="relative border border-[#E7E7E7A3] rounded-3xl my-10 px-6 py-24 sm:py-32 lg:px-8 overflow-hidden">
      <UnicornScene className="opacity-10" />
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-title text-3xl text-gray-900 sm:text-4xl">
          {title}
        </h2>
        {typeof children === "string" ? (
          <p className="mt-6 text-lg leading-8 text-gray-600">{children}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
