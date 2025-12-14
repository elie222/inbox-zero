"use client";

import * as React from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/utils";

interface BaseProps {
  children: React.ReactNode;
}

interface RootCredenzaProps extends BaseProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface CredenzaProps extends BaseProps {
  className?: string;
  asChild?: true;
}

const CredenzaContext = React.createContext<{ isDesktop: boolean }>({
  isDesktop: false,
});

const useCredenzaContext = () => {
  const context = React.useContext(CredenzaContext);
  if (!context) {
    throw new Error(
      "Credenza components cannot be rendered outside the Credenza Context",
    );
  }
  return context;
};

const Credenza = ({ children, ...props }: RootCredenzaProps) => {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const CredenzaComponent = isDesktop ? Dialog : Drawer;

  return (
    <CredenzaContext.Provider value={{ isDesktop }}>
      <CredenzaComponent {...props} {...(!isDesktop && { autoFocus: true })}>
        {children}
      </CredenzaComponent>
    </CredenzaContext.Provider>
  );
};

const CredenzaTrigger = ({ className, children, ...props }: CredenzaProps) => {
  const { isDesktop } = useCredenzaContext();
  const CredenzaTriggerComponent = isDesktop ? DialogTrigger : DrawerTrigger;

  return (
    <CredenzaTriggerComponent className={className} {...props}>
      {children}
    </CredenzaTriggerComponent>
  );
};

const CredenzaClose = ({ className, children, ...props }: CredenzaProps) => {
  const { isDesktop } = useCredenzaContext();
  const CredenzaCloseComponent = isDesktop ? DialogClose : DrawerClose;

  return (
    <CredenzaCloseComponent className={className} {...props}>
      {children}
    </CredenzaCloseComponent>
  );
};

const CredenzaContent = ({ className, children, ...props }: CredenzaProps) => {
  const { isDesktop } = useCredenzaContext();
  const CredenzaContentComponent = isDesktop ? DialogContent : DrawerContent;

  return (
    <CredenzaContentComponent className={className} {...props}>
      {children}
    </CredenzaContentComponent>
  );
};

const CredenzaDescription = ({
  className,
  children,
  ...props
}: CredenzaProps) => {
  const { isDesktop } = useCredenzaContext();
  const CredenzaDescriptionComponent = isDesktop
    ? DialogDescription
    : DrawerDescription;

  return (
    <CredenzaDescriptionComponent className={className} {...props}>
      {children}
    </CredenzaDescriptionComponent>
  );
};

const CredenzaHeader = ({ className, children, ...props }: CredenzaProps) => {
  const { isDesktop } = useCredenzaContext();
  const CredenzaHeaderComponent = isDesktop ? DialogHeader : DrawerHeader;

  return (
    <CredenzaHeaderComponent className={className} {...props}>
      {children}
    </CredenzaHeaderComponent>
  );
};

const CredenzaTitle = ({ className, children, ...props }: CredenzaProps) => {
  const { isDesktop } = useCredenzaContext();
  const CredenzaTitleComponent = isDesktop ? DialogTitle : DrawerTitle;

  return (
    <CredenzaTitleComponent className={className} {...props}>
      {children}
    </CredenzaTitleComponent>
  );
};

const CredenzaBody = ({ className, children, ...props }: CredenzaProps) => {
  return (
    <div className={cn("px-4 md:px-0", className)} {...props}>
      {children}
    </div>
  );
};

const CredenzaFooter = ({ className, children, ...props }: CredenzaProps) => {
  const { isDesktop } = useCredenzaContext();
  const CredenzaFooterComponent = isDesktop ? DialogFooter : DrawerFooter;

  return (
    <CredenzaFooterComponent className={className} {...props}>
      {children}
    </CredenzaFooterComponent>
  );
};

export {
  Credenza,
  CredenzaTrigger,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaBody,
  CredenzaFooter,
};
