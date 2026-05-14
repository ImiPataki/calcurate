import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "../../lib/utils";

export function Switch({ className, checked, onCheckedChange, ...props }) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-muted transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-card shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  );
}

export function SwitchField({ label, checked, onCheckedChange, className }) {
  return (
    <label className={cn("flex min-h-9 items-center justify-between gap-3 rounded-md border bg-card px-3 text-sm text-foreground shadow-sm", className)}>
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={(value) => onCheckedChange(Boolean(value))} />
    </label>
  );
}
