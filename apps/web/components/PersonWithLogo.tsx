import Image from "next/image";

export function PersonWithLogo({
  src,
  name,
  title,
}: {
  src: string;
  name: string;
  title: string;
}) {
  return (
    <div className="flex items-center justify-center space-x-4">
      <div className="flex-shrink-0">
        <Image
          src={src}
          alt={name}
          className="h-12 w-12 rounded-full object-cover ring-2 ring-blue-200"
          width={48}
          height={48}
        />
      </div>
      <div className="text-left">
        <p className="text-base font-medium text-gray-900">{name}</p>
        <p className="text-sm text-gray-600">{title}</p>
      </div>
    </div>
  );
}

export function ABTestimonial() {
  return (
    <PersonWithLogo
      src="/images/case-studies/clicks-talent/ab.png"
      name='Abraham "AB" Lieberman'
      title="Founder & CEO of Clicks Talent"
    />
  );
}
