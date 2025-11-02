import { cva } from "class-variance-authority";

export type BadgeVariant = "default" | "success";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
}

export function Badge({ children, variant = "default" }: BadgeProps) {
  const badgeStyle = cva(
    "flex items-center gap-2 border rounded-xl py-0.5 px-2 w-fit h-fit font-medium",
    {
      variants: {
        variant: {
          default:
            "bg-gradient-to-b from-[#EFF6FF] to-[#D8E9FF] border-[#5CA9EC2E] text-[#006EFF] shadow-[0px_2px_3.4px_0px_#CFD9F938,0px_1px_1px_0px_#CFD9F994]",
          success:
            "bg-gradient-to-b from-[#F3FFEF] to-[#E1FFD8] border-[#7EC75D30] text-[#17A34A] shadow-[0px_2px_3.4px_0px_#CFF9DE38,0px_1px_1px_0px_#76D98F1C]",
        },
      },
    },
  );

  return (
    <div className={badgeStyle({ variant })}>
      <p className="text-xs">{children}</p>
    </div>
  );
}
