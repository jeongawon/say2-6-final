import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "../../../lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, id, ...props }, ref) => {
    const inputId = id ?? props.name;
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {label}
            {props.required && <span className="text-critical ml-0.5">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "h-10 px-3 rounded-lg border bg-white text-sm text-slate-900 dark:bg-vuno-bg dark:text-white",
            "placeholder:text-slate-400 dark:placeholder:text-vuno-dim",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:border-brand-500",
            "disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-vuno-surface dark:disabled:text-vuno-dim",
            "transition-colors",
            error ? "border-critical/60" : "border-slate-300 dark:border-vuno-border",
            className,
          )}
          {...props}
        />
        {hint && !error && <span className="text-xs text-slate-500 dark:text-vuno-muted">{hint}</span>}
        {error && <span className="text-xs text-critical">{error}</span>}
      </div>
    );
  },
);
Input.displayName = "Input";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, hint, error, id, ...props }, ref) => {
    const inputId = id ?? props.name;
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {label}
            {props.required && <span className="text-critical ml-0.5">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={cn(
            "min-h-[80px] px-3 py-2 rounded-lg border bg-white text-sm text-slate-900 dark:bg-vuno-bg dark:text-white",
            "placeholder:text-slate-400 dark:placeholder:text-vuno-dim resize-y",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:border-brand-500",
            "transition-colors",
            error ? "border-critical/60" : "border-slate-300 dark:border-vuno-border",
            className,
          )}
          {...props}
        />
        {hint && !error && <span className="text-xs text-slate-500 dark:text-vuno-muted">{hint}</span>}
        {error && <span className="text-xs text-critical">{error}</span>}
      </div>
    );
  },
);
Textarea.displayName = "Textarea";
