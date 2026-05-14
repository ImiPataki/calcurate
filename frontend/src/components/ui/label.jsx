import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "../../lib/utils";

export function Label({ className, ...props }) {
  return (
    <LabelPrimitive.Root
      className={cn("text-xs font-medium leading-none text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)}
      {...props}
    />
  );
}

export function Field({ label, className, children }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      {label && <Label>{label}</Label>}
      {children}
    </div>
  );
}
