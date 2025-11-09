import * as React from "react";

interface LiquidGlassButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  children?: React.ReactNode;
}

export function LiquidGlassButton({
  className,
  children,
  type,
  ...props
}: LiquidGlassButtonProps) {
  const filterId = React.useId();

  return (
    <>
      <button type={type ?? "button"} className={className} {...props}>
        <div
          className="group relative flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-full p-8 font-semibold text-black transition-all duration-300 hover:p-9 hover:[&>div]:rounded-[4rem] will-change-transform"
          style={{
            boxShadow:
              "0px 14.3px 38.74px 3.9px #0000001A, 0px 0px 4.16px 0px #0000000D",
          }}
        >
          <div
            className="absolute inset-0 z-0 overflow-hidden rounded-full backdrop-blur-[3px] transition-all duration-300 will-change-transform"
            style={{ filter: `url(#${filterId})` }}
          />
          <div className="absolute inset-0 z-10 rounded-full bg-white/25 transition-all duration-300 will-change-transform" />
          <div
            className="absolute inset-0 z-20 overflow-hidden rounded-full transition-all duration-300 will-change-transform"
            style={{
              boxShadow:
                "inset 2px 2px 1px 0 rgba(255, 255, 255, 0.5), inset -1px -1px 1px 1px rgba(255, 255, 255, 0.5)",
            }}
          />
          <div className="z-30 flex items-center justify-center rounded-full transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,2.2)] will-change-transform group-hover:scale-110">
            {children}
          </div>
        </div>
      </button>
      <svg className="hidden" aria-hidden>
        <filter
          id={filterId}
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          filterUnits="objectBoundingBox"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.01 0.01"
            numOctaves="1"
            seed="5"
            result="turbulence"
          />
          <feComponentTransfer in="turbulence" result="mapped">
            <feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5" />
            <feFuncG type="gamma" amplitude="0" exponent="1" offset="0" />
            <feFuncB type="gamma" amplitude="0" exponent="1" offset="0.5" />
          </feComponentTransfer>
          <feGaussianBlur in="turbulence" stdDeviation="3" result="softMap" />
          <feSpecularLighting
            in="softMap"
            surfaceScale="5"
            specularConstant="1"
            specularExponent="100"
            lightingColor="white"
            result="specLight"
          >
            <fePointLight x="-200" y="-200" z="300" />
          </feSpecularLighting>
          <feComposite
            in="specLight"
            operator="arithmetic"
            k1="0"
            k2="1"
            k3="1"
            k4="0"
            result="litImage"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softMap"
            scale="150"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>
    </>
  );
}
