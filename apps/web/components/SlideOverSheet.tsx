import { useCallback, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function SlideOverSheet(props: {
  children: React.ReactNode;
  title: string;
  description: string;
  content: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  return (
    <Sheet modal={false} open={open} onOpenChange={setOpen}>
      <SheetTrigger
        asChild
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        {props.children}
      </SheetTrigger>
      <SheetContent
        className="w-[400px] overflow-y-auto sm:w-[540px] md:w-[1000px] md:max-w-2xl"
        onPointerDownOutside={(e) => {
          e.preventDefault();
        }}
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
        onEscapeKeyDown={close}
      >
        <SheetHeader>
          <SheetTitle>{props.title}</SheetTitle>
          <SheetDescription>{props.description}</SheetDescription>
        </SheetHeader>

        {props.content}
      </SheetContent>
    </Sheet>
  );
}
