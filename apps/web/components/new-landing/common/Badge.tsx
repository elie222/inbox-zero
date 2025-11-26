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
          blue: "text-new-blue-600 from-new-blue-150 to-new-blue-200 shadow-[0px_2px_3.4px_0px_#CFD9F938,0px_1px_1px_0px_#CFD9F994]",
          purple:
            "text-new-purple-600 from-new-purple-200 to-new-purple-300 shadow-[0px_2px_3.4px_0px_#CFD9F938,0px_1px_1px_0px_#CFD9F994]",
          "dark-blue":
            "text-new-indigo-600 from-new-indigo-150 to-new-indigo-200 shadow-[0px_2px_3.4px_0px_#CFD9F938,0px_1px_1px_0px_#CFD9F994]",
          green:
            "text-new-green-600 from-new-green-150 to-new-green-200 shadow-[0px_2px_3.4px_0px_#CFF9DE38,0px_1px_1px_0px_#76D98F1C]",
          yellow:
            "text-new-yellow-500 from-new-yellow-150 to-new-yellow-200 shadow-[0px_2px_3.4px_0px_#F9EDCF38,0px_1px_1px_0px_#F9ECCF94]",
          brown:
            "text-new-brown-500 from-new-brown-150 to-new-brown-200 shadow-[0px_2px_3.4px_0px_#F0D4BA38,0px_1px_1px_0px_#F9E0CF94]",
          red: "text-new-red-500 from-new-red-150 to-new-red-200 shadow-[0px_2px_3.4px_0px_#F9CFD326,0px_1px_1px_0px_#F9CFD08A]",
          "light-blue":
            "text-new-cyan-500 from-new-cyan-100 to-new-cyan-200 shadow-[0px_2px_3.4px_0px_#E6E6E638,0px_1px_1px_0px_#B1B1B11C]",
          orange:
            "text-new-orange-600 from-new-orange-150 to-new-orange-200 shadow-[0px_2px_3.4px_0px_#F9D3CF38,0px_1px_1px_0px_#F9E5CF94]",
          pink: "text-new-pink-500 from-new-pink-150 to-new-pink-200 shadow-[0px_2px_3.4px_0px_#F9CFD326,0px_1px_1px_0px_#F9CFD08A]",
          gray: "text-new-gray-500 from-new-gray-150 to-new-gray-200 shadow-[0px_2px_3.4px_0px_#E6E6E638,0px_1px_1px_0px_#B1B1B11C]",
          "dark-gray":
            "text-new-gray-600 from-new-gray-150 to-new-gray-200 shadow-[0px_2px_3.4px_0px_#E6E6E638,0px_1px_1px_0px_#B1B1B11C]",
        },
      },
    },
  );

  const badgeInnerStyle = cva(
    "flex items-center gap-1 rounded-[7px] py-0.5 px-2 w-fit h-fit font-medium bg-gradient-to-b",
    {
      variants: {
        variant: {
          blue: "from-new-blue-50 to-new-blue-100",
          purple: "from-new-purple-50 to-new-purple-100",
          "dark-blue": "from-new-indigo-50 to-new-indigo-100",
          green: "from-new-green-50 to-new-green-100",
          yellow: "from-new-yellow-50 to-new-yellow-100",
          brown: "from-new-brown-50 to-new-brown-100",
          red: "from-new-red-50 to-new-red-100",
          "light-blue": "from-new-cyan-50 to-new-cyan-100",
          orange: "from-new-orange-50 to-new-orange-100",
          pink: "from-new-pink-50 to-new-pink-100",
          gray: "from-new-gray-50 to-new-gray-100",
          "dark-gray": "from-new-gray-50 to-new-gray-100",
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
