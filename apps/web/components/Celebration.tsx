import { useEffect, useState } from "react";
import Confetti from "react-dom-confetti";
import Image from "next/image";
import { getCelebrationImage } from "@/utils/celebration";

export function Celebration(props: {}) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(true);
  }, []);

  return (
    <>
      <div className="mt-20 flex items-center justify-center text-lg font-semibold text-gray-900">
        Congrats! You made it to Inbox Zero!
      </div>
      <div className="flex items-center justify-center">
        <Confetti
          active={active}
          config={{
            duration: 5_000,
            elementCount: 500,
            spread: 200,
          }}
        />
      </div>
      <div className="mt-8 flex items-center justify-center">
        <Image
          src={getCelebrationImage()}
          width={400}
          height={400}
          alt="Congrats!"
          unoptimized
        />
      </div>
    </>
  );
}
