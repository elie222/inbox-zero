import Image from "next/image";

export function Privacy() {
  return (
    <div className="bg-white py-24" id="features">
      <div className="mb-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
        <div className="flex items-center gap-8">
          <Image
            src="/images/home/soc2.svg"
            alt="SOC2 Type II Compliant"
            className="h-[120px] w-auto"
            width="200"
            height="120"
          />

          <Image
            src="/images/home/soc2.png"
            alt="SOC2 Type II Compliant"
            className="h-[160px] w-auto"
            width="300"
            height="160"
          />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl lg:text-center">
          <h2 className="font-cal text-base leading-7 text-blue-600">
            Privacy first
          </h2>
          <p className="mt-2 font-cal text-3xl text-gray-900 sm:text-4xl">
            Open Source. See exactly what our code does. Or host it yourself.
          </p>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Your data is never used to train general AI models, and we maintain
            the highest security and privacy standards.
          </p>
          <p className="mt-2 text-lg leading-8 text-gray-600">
            Inbox Zero is SOC2 compliant and CASA Tier 2 approved. It has
            undergone a thorough security process with Google to ensure the
            protection of your emails. You can even self-host Inbox Zero on your
            own infrastructure.
          </p>
        </div>
      </div>
    </div>
  );
}
