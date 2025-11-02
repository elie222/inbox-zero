interface CardProps {
  children: React.ReactNode;
}

export function Card({ children }: CardProps) {
  return (
    <div className="flex flex-col gap-4 p-8 border border-[#E7E7E780] rounded-[32px] bg-white shadow-[0px_3px_12.9px_0px_#97979714]">
      {children}
    </div>
  );
}
