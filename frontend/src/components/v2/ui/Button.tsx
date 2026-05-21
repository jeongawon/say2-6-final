import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../../lib/cn";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "ai";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary:   "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm",
  secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200 active:bg-slate-300 dark:bg-vuno-elevated dark:text-white dark:hover:bg-vuno-border",
  outline:   "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 active:bg-slate-100 dark:border-vuno-border dark:bg-vuno-surface dark:text-white dark:hover:bg-vuno-elevated",
  ghost:     "text-slate-700 hover:bg-slate-100 active:bg-slate-200 dark:text-slate-200 dark:hover:bg-vuno-elevated",
  danger:    "bg-critical text-white hover:bg-red-700 active:bg-red-800 shadow-sm",
  ai:        "bg-gradient-to-r from-brand-600 to-ai-accent text-white hover:opacity-90 shadow-ai",
};

const sizeStyles: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-md gap-1.5",
  md: "h-10 px-4 text-sm rounded-lg gap-2",
  lg: "h-12 px-6 text-base rounded-lg gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", fullWidth, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium",
          "transition-all duration-150",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
          variantStyles[variant],
          sizeStyles[size],
          fullWidth && "w-full",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
