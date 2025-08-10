export function OnboardingWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-center px-6 py-20 text-gray-900 bg-slate-50 min-h-screen">
      <div className="mx-auto flex max-w-6xl flex-col justify-center space-y-6 p-10 duration-500 animate-in fade-in">
        {children}
      </div>
    </div>
  );
}
