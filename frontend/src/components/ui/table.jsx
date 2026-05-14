import { cn } from "../../lib/utils";

export function Table({ className, ...props }) {
  return (
    <div className={cn("w-full overflow-auto", className)}>
      <table {...props} />
    </div>
  );
}

export function TableHeader(props) {
  return <thead {...props} />;
}

export function TableBody(props) {
  return <tbody {...props} />;
}

export function TableRow({ className, ...props }) {
  return <tr className={cn("transition-colors hover:bg-muted/50", className)} {...props} />;
}

export function TableHead({ className, ...props }) {
  return <th className={cn(className)} {...props} />;
}

export function TableCell({ className, ...props }) {
  return <td className={cn(className)} {...props} />;
}
