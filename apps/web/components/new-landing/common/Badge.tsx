import { cva } from "class-variance-authority";

export type BadgeVariant =
  | "blue"
  | "purple"
  | "dark-blue"
  | "green"
  | "yellow"
  | "brown"
  | "red"
  | "light-blue"
  | "orange"
  | "pink"
  | "gray"
  | "dark-gray";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  icon?: React.ReactNode;
  size?: "sm" | "md";
}

export function Badge({
  children,
  variant = "blue",
  icon,
  size = "md",
}: BadgeProps) {
  const badgeOuterStyle = cva(
    "rounded-[8px] w-fit h-fit font-medium p-[1px] bg-gradient-to-b shrink-0",
    {
      variants: {
        variant: {
          blue: "text-[#006EFF] from-[#D6E8FC] to-[#C3DEFC] shadow-[0px_2px_3.4px_0px_#CFD9F938,0px_1px_1px_0px_#CFD9F994]",
          purple:
            "text-[#6410FF] from-[#E1D5FC] to-[#D7C3FC] shadow-[0px_2px_3.4px_0px_#CFD9F938,0px_1px_1px_0px_#CFD9F994]",
          "dark-blue":
            "text-[#124DFF] from-[#D5DEFC] to-[#C2D0FC] shadow-[0px_2px_3.4px_0px_#CFD9F938,0px_1px_1px_0px_#CFD9F994]",
          green:
            "text-[#17A34A] from-[#DDF4D3] to-[#CFF4C0] shadow-[0px_2px_3.4px_0px_#CFF9DE38,0px_1px_1px_0px_#76D98F1C]",
          yellow:
            "text-[#D8A40C] from-[#E7E0CB] to-[#E7DBB9] shadow-[0px_2px_3.4px_0px_#F9EDCF38,0px_1px_1px_0px_#F9ECCF94]",
          brown:
            "text-[#CC762F] from-[#EFDFD3] to-[#E9D1BE] shadow-[0px_2px_3.4px_0px_#F0D4BA38,0px_1px_1px_0px_#F9E0CF94]",
          red: "text-[#C94244] from-[#FDD3D4] to-[#FCC0C0] shadow-[0px_2px_3.4px_0px_#F9CFD326,0px_1px_1px_0px_#F9CFD08A]",
          "light-blue":
            "text-[#49D1FA] from-[#E5F9FF] to-[#D0F4FF] shadow-[0px_2px_3.4px_0px_#E6E6E638,0px_1px_1px_0px_#B1B1B11C]",
          orange:
            "text-[#E65707] from-[#FCE2D5] to-[#FCD6C2] shadow-[0px_2px_3.4px_0px_#F9D3CF38,0px_1px_1px_0px_#F9E5CF94]",
          pink: "text-[#C942B2] from-[#FDD3EB] to-[#FDBFE0] shadow-[0px_2px_3.4px_0px_#F9CFD326,0px_1px_1px_0px_#F9CFD08A]",
          gray: "text-[#8E8E8E] from-[#EEEEEE] to-[#E6E6E6] shadow-[0px_2px_3.4px_0px_#E6E6E638,0px_1px_1px_0px_#B1B1B11C]",
          "dark-gray":
            "text-[#525252] from-[#EEEEEE] to-[#E6E6E6] shadow-[0px_2px_3.4px_0px_#E6E6E638,0px_1px_1px_0px_#B1B1B11C]",
        },
      },
    },
  );

  const badgeInnerStyle = cva(
    "flex items-center gap-1 rounded-[7px] py-0.5 px-2 w-fit h-fit font-medium bg-gradient-to-b",
    {
      variants: {
        variant: {
          blue: "from-[#EFF6FF] to-[#D8E9FF]",
          purple: "from-[#F3EAFE] to-[#E7DAFF]",
          "dark-blue": "from-[#EFF3FF] to-[#D9E2FF]",
          green: "from-[#F3FFEF] to-[#E1FFD8]",
          yellow: "from-[#FFFBEF] to-[#FFF3DA]",
          brown: "from-[#FEEDE0] to-[#F8E0CC]",
          red: "from-[#FFEEF0] to-[#FFDADB]",
          "light-blue": "from-[#FEFFFF] to-[#E5F9FF]",
          orange: "from-[#FFF5EF] to-[#FFE7DA]",
          pink: "from-[#FFEEF8] to-[#FFDAEC]",
          gray: "from-[#FFFFFF] to-[#F6F6F6]",
          "dark-gray": "from-[#FFFFFF] to-[#F6F6F6]",
        },
      },
    },
  );

  const badgeTextStyle = cva("text-xs", {
    variants: {
      size: {
        sm: "text-[9px] font-bold",
        md: "text-xs",
      },
    },
  });

  return (
    <div className={badgeOuterStyle({ variant })}>
      <div className={badgeInnerStyle({ variant })}>
        {icon || null}
        <p className={badgeTextStyle({ size })}>{children}</p>
      </div>
    </div>
  );
}
