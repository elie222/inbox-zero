import Image from "next/image";

export function LogoCloud() {
  return (
    <div className="mx-auto mt-16 max-w-7xl px-6 lg:px-8">
      <h2 className="text-center font-cal text-lg leading-8 text-gray-900">
        You{`'`}re in good company
      </h2>

      <div className="mx-auto mt-8 grid max-w-lg grid-cols-4 items-center gap-x-8 gap-y-12 sm:max-w-xl sm:grid-cols-6 sm:gap-x-10 sm:gap-y-14 lg:mx-0 lg:max-w-none lg:grid-cols-5">
        <Image
          className="col-span-2 max-h-12 w-full object-contain lg:col-span-1"
          src="/images/logos/resend.svg"
          alt="Resend"
          width={158}
          height={48}
        />
        <Image
          className="col-span-2 max-h-12 w-full object-contain lg:col-span-1"
          src="/images/logos/bytedance.svg"
          alt="ByteDance"
          width={158}
          height={48}
        />
        <Image
          className="col-span-2 max-h-10 w-full object-contain lg:col-span-1"
          src="/images/logos/zendesk.svg"
          alt="ZenDesk"
          width={158}
          height={48}
        />
        <Image
          className="col-span-2 max-h-12 w-full object-contain sm:col-start-2 lg:col-span-1"
          src="/images/logos/brilliant.svg"
          alt="Brilliant"
          width={158}
          height={48}
        />
        <Image
          className="col-span-2 col-start-2 max-h-10 w-full object-contain sm:col-start-auto lg:col-span-1"
          src="/images/logos/joco.svg"
          alt="JOCO"
          width={158}
          height={48}
        />
      </div>
    </div>
  );
}
