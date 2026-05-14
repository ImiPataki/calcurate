import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";

const badgeVariants = cva("inline-flex h-6 items-center rounded-md border px-2 text-xs font-medium", {
  variants: {
    variant: {
      default: "border-primary/20 bg-primary text-primary-foreground",
      secondary: "border-border bg-secondary text-secondary-foreground",
      outline: "border-border bg-card text-muted-foreground",
      success: "border-primary/20 bg-[#e4f0ea] text-primary",
      warning: "border-[#d8be76] bg-[#fff7df] text-[#6e5500]",
      destructive: "border-destructive/30 bg-[#fff1ef] text-destructive",
    },
  },
  defaultVariants: {
    variant: "secondary",
  },
});

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
