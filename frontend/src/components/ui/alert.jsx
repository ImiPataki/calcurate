import { cn } from "../../lib/utils";

export function Alert({ className, variant = "default", ...props }) {
  return (
    <div
      className={cn(
        "rounded-md border px-4 py-3 text-sm",
        variant === "destructive" && "border-destructive/30 bg-[#fff1ef] text-destructive",
        variant === "success" && "border-primary/20 bg-[#e4f0ea] text-primary",
        variant === "default" && "border-border bg-card text-card-foreground",
        className,
      )}
      {...props}
    />
  );
}
