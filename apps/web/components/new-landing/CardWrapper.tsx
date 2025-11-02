interface CardWrapperProps {
  children: React.ReactNode;
}

export function CardWrapper({ children }: CardWrapperProps) {
  return (
    <div className="text-left p-6 rounded-[56px] border border-[#F7F7F7] bg-gradient-to-b from-[#FFFFFF] to-[#F9F9F9]">
      {children}
    </div>
  );
}
