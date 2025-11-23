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
          blue: "text-badge-blue-main from-badge-blue-outer-from to-badge-blue-outer-to shadow-[0px_2px_3.4px_0px_#CFD9F938,0px_1px_1px_0px_#CFD9F994]",
          purple:
            "text-badge-purple-main from-badge-purple-outer-from to-badge-purple-outer-to shadow-[0px_2px_3.4px_0px_#CFD9F938,0px_1px_1px_0px_#CFD9F994]",
          "dark-blue":
            "text-badge-dark-blue-main from-badge-dark-blue-outer-from to-badge-dark-blue-outer-to shadow-[0px_2px_3.4px_0px_#CFD9F938,0px_1px_1px_0px_#CFD9F994]",
          green:
            "text-badge-green-main from-badge-green-outer-from to-badge-green-outer-to shadow-[0px_2px_3.4px_0px_#CFF9DE38,0px_1px_1px_0px_#76D98F1C]",
          yellow:
            "text-badge-yellow-main from-badge-yellow-outer-from to-badge-yellow-outer-to shadow-[0px_2px_3.4px_0px_#F9EDCF38,0px_1px_1px_0px_#F9ECCF94]",
          brown:
            "text-badge-brown-main from-badge-brown-outer-from to-badge-brown-outer-to shadow-[0px_2px_3.4px_0px_#F0D4BA38,0px_1px_1px_0px_#F9E0CF94]",
          red: "text-badge-red-main from-badge-red-outer-from to-badge-red-outer-to shadow-[0px_2px_3.4px_0px_#F9CFD326,0px_1px_1px_0px_#F9CFD08A]",
          "light-blue":
            "text-badge-light-blue-main from-badge-light-blue-outer-from to-badge-light-blue-outer-to shadow-[0px_2px_3.4px_0px_#E6E6E638,0px_1px_1px_0px_#B1B1B11C]",
          orange:
            "text-badge-orange-main from-badge-orange-outer-from to-badge-orange-outer-to shadow-[0px_2px_3.4px_0px_#F9D3CF38,0px_1px_1px_0px_#F9E5CF94]",
          pink: "text-badge-pink-main from-badge-pink-outer-from to-badge-pink-outer-to shadow-[0px_2px_3.4px_0px_#F9CFD326,0px_1px_1px_0px_#F9CFD08A]",
          gray: "text-badge-gray-main from-badge-gray-outer-from to-badge-gray-outer-to shadow-[0px_2px_3.4px_0px_#E6E6E638,0px_1px_1px_0px_#B1B1B11C]",
          "dark-gray":
            "text-badge-dark-gray-main from-badge-dark-gray-outer-from to-badge-dark-gray-outer-to shadow-[0px_2px_3.4px_0px_#E6E6E638,0px_1px_1px_0px_#B1B1B11C]",
        },
      },
    },
  );

  const badgeInnerStyle = cva(
    "flex items-center gap-1 rounded-[7px] py-0.5 px-2 w-fit h-fit font-medium bg-gradient-to-b",
    {
      variants: {
        variant: {
          blue: "from-badge-blue-inner-from to-badge-blue-inner-to",
          purple: "from-badge-purple-inner-from to-badge-purple-inner-to",
          "dark-blue":
            "from-badge-dark-blue-inner-from to-badge-dark-blue-inner-to",
          green: "from-badge-green-inner-from to-badge-green-inner-to",
          yellow: "from-badge-yellow-inner-from to-badge-yellow-inner-to",
          brown: "from-badge-brown-inner-from to-badge-brown-inner-to",
          red: "from-badge-red-inner-from to-badge-red-inner-to",
          "light-blue":
            "from-badge-light-blue-inner-from to-badge-light-blue-inner-to",
          orange: "from-badge-orange-inner-from to-badge-orange-inner-to",
          pink: "from-badge-pink-inner-from to-badge-pink-inner-to",
          gray: "from-badge-gray-inner-from to-badge-gray-inner-to",
          "dark-gray":
            "from-badge-dark-gray-inner-from to-badge-dark-gray-inner-to",
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
