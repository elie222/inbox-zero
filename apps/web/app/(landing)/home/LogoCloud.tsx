import Image from "next/image";

export function LogoCloud() {
  return (
    <div className="mx-auto mt-16 max-w-7xl px-6 lg:px-8">
      <h2 className="text-center font-cal text-lg leading-8 text-gray-900">
        Trusted by 9,000+ productive users
      </h2>

      <div className="mx-auto mt-8 grid max-w-lg grid-cols-2 items-center gap-x-8 gap-y-12 sm:max-w-xl sm:grid-cols-3 sm:gap-x-10 sm:gap-y-14 lg:mx-0 lg:max-w-none lg:grid-cols-6">
        <Image
          className="max-h-12 w-full object-contain"
          src="/images/logos/resend.svg"
          alt="Resend"
          width={158}
          height={48}
        />
        <Image
          className="max-h-12 w-full object-contain"
          src="/images/logos/bytedance.svg"
          alt="ByteDance"
          width={158}
          height={48}
        />
        <Image
          className="max-h-12 w-full object-contain"
          src="/images/logos/zendesk.svg"
          alt="ZenDesk"
          width={158}
          height={48}
        />
        <Image
          className="max-h-12 w-full object-contain"
          src="/images/logos/brilliant.svg"
          alt="Brilliant"
          width={158}
          height={48}
        />
        <Image
          className="max-h-12 w-full object-contain"
          src="/images/logos/doac.svg"
          alt="DOAC"
          width={158}
          height={48}
        />
        <Image
          className="max-h-12 w-full object-contain"
          src="/images/logos/joco.svg"
          alt="JOCO"
          width={158}
          height={48}
        />
      </div>
    </div>
  );
}
