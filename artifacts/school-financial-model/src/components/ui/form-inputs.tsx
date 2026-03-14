import React from "react";
import { useFormContext } from "react-hook-form";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  name: string;
  label: string;
  helperText?: string;
  prefix?: string;
  suffix?: string;
}

export function FormInput({ name, label, helperText, prefix, suffix, className, type = "text", ...props }: InputProps) {
  const { register, formState: { errors } } = useFormContext();
  const error = errors[name]?.message as string;

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
      {error && <p className="text-sm text-destructive font-medium animate-in fade-in">{error}</p>}
      {helperText && !error && <p className="text-sm text-muted-foreground">{helperText}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  name: string;
  label: string;
  options: { label: string; value: string }[];
  helperText?: string;
}

export function FormSelect({ name, label, options, helperText, className, ...props }: SelectProps) {
  const { register, formState: { errors } } = useFormContext();
  const error = errors[name]?.message as string;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={name} className="text-sm font-semibold text-foreground">
        {label}
      </label>
      <select
        id={name}
        className={cn(
          "w-full rounded-xl border-2 border-border bg-card px-4 py-3 text-base text-foreground outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 appearance-none cursor-pointer",
          error && "border-destructive focus:border-destructive focus:ring-destructive/10"
        )}
        {...register(name)}
        {...props}
      >
        <option value="" disabled>Select an option...</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <p className="text-sm text-destructive font-medium animate-in fade-in">{error}</p>}
      {helperText && !error && <p className="text-sm text-muted-foreground">{helperText}</p>}
    </div>
  );
}
