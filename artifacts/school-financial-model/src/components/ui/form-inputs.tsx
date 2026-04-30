import React from "react";
import { useFormContext, type FieldErrors } from "react-hook-form";
import { cn } from "@/lib/utils";

export function getNestedError(errors: FieldErrors, name: string): string | undefined {
  const parts = name.split(".");
  let current: unknown = errors;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  if (current && typeof current === "object" && "message" in current) {
    return (current as { message?: string }).message;
  }
  return undefined;
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  name: string;
  label: React.ReactNode;
  helperText?: string;
  prefix?: string;
  suffix?: string;
}

export function FormInput({ name, label, helperText, prefix, suffix, className, type = "text", ...props }: InputProps) {
  const { register, formState: { errors } } = useFormContext();
  const error = getNestedError(errors, name);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={name} className="text-sm font-semibold text-foreground">
        {label}
      </label>
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-4 text-muted-foreground font-medium">{prefix}</span>
        )}
        <input
          id={name}
          type={type}
          aria-invalid={!!error}
          className={cn(
            "w-full rounded-xl border-2 border-border bg-card px-4 py-3 text-base text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10",
            prefix && "pl-8",
            suffix && "pr-8",
            error && "border-destructive focus:border-destructive focus:ring-destructive/10"
          )}
          {...register(name, { valueAsNumber: type === "number" })}
          {...props}
        />
        {suffix && (
          <span className="absolute right-4 text-muted-foreground font-medium">{suffix}</span>
        )}
      </div>
      {error && <p className="text-sm text-destructive font-medium animate-in fade-in" data-error="true">{error}</p>}
      {helperText && !error && <p className="text-sm text-muted-foreground">{helperText}</p>}
    </div>
  );
}

interface CheckboxProps {
  name: string;
  label: React.ReactNode;
  helperText?: React.ReactNode;
  className?: string;
}

export function FormCheckbox({ name, label, helperText, className }: CheckboxProps) {
  const { register } = useFormContext();

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <input
        id={name}
        type="checkbox"
        className="mt-1 h-5 w-5 rounded border-2 border-border text-primary accent-primary cursor-pointer"
        {...register(name)}
      />
      <div>
        <label
          htmlFor={name}
          className="text-sm font-semibold text-foreground cursor-pointer"
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('[role="button"]') || target.closest('[role="tooltip"]')) {
              e.preventDefault();
            }
          }}
        >
          {label}
        </label>
        {helperText && <p className="text-sm text-muted-foreground mt-0.5">{helperText}</p>}
      </div>
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  name: string;
  label: string;
  options: { label: string; value: string }[];
  helperText?: string;
  valueAsNumber?: boolean;
}

export function FormSelect({ name, label, options, helperText, className, valueAsNumber, ...props }: SelectProps) {
  const { register, formState: { errors } } = useFormContext();
  const error = getNestedError(errors, name);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={name} className="text-sm font-semibold text-foreground">
        {label}
      </label>
      <select
        id={name}
        aria-invalid={!!error}
        className={cn(
          "w-full rounded-xl border-2 border-border bg-card px-4 py-3 text-base text-foreground outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 appearance-none cursor-pointer",
          error && "border-destructive focus:border-destructive focus:ring-destructive/10"
        )}
        defaultValue=""
        {...register(
          name,
          valueAsNumber
            ? {
                setValueAs: (v: unknown) => {
                  if (v === "" || v === null || v === undefined) return undefined;
                  const n = Number(v);
                  return Number.isNaN(n) ? undefined : n;
                },
              }
            : {},
        )}
        {...props}
      >
        <option value="" disabled hidden>Select an option...</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <p className="text-sm text-destructive font-medium animate-in fade-in" data-error="true">{error}</p>}
      {helperText && !error && <p className="text-sm text-muted-foreground">{helperText}</p>}
    </div>
  );
}
