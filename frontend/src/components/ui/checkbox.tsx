import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "h-4 w-4 rounded border-border text-primary accent-[hsl(var(--primary))]",
        className
      )}
      {...props}
    />
  )
);
Checkbox.displayName = "Checkbox";
