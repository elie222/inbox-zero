import { SidebarTrigger } from "@/components/ui/sidebar";

/**
 * The toggle at the top of a collapsed sidebar rail. Shared so the app and
 * mail rails line it up identically, including below the mac traffic lights.
 */
export function SidebarRailToggle({ name }: { name: string }) {
  return (
    <div data-desktop-mac-titlebar-spacer className="pb-2">
      <SidebarTrigger name={name} />
    </div>
  );
}
