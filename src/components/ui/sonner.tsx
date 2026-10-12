"use client";
import { Toaster as Sonner, toast } from "sonner";
import type { ComponentProps, CSSProperties } from "react";
import { CircleCheck, CircleAlert, Info, LoaderCircle } from "lucide-react";

function Toaster(props: ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      theme="system"
      position="bottom-right"
      closeButton
      duration={5000}
      visibleToasts={3}
      icons={{
        success: (
          <CircleCheck className="size-4 text-moss-700 dark:text-moss-300" />
        ),
        error: <CircleAlert className="size-4 text-destructive" />,
        info: <Info className="size-4" />,
        loading: <LoaderCircle className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-lg)",
          fontFamily: "var(--font-sans)",
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "shadow-lg",
          description: "!text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}
export { Toaster, toast };
