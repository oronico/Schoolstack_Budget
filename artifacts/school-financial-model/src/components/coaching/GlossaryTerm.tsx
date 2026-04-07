import { useState, useRef, useEffect, useCallback, useId } from "react";
import { GLOSSARY, type GlossaryEntry } from "@/lib/coaching/glossary";
import { cn } from "@/lib/utils";

interface GlossaryTermProps {
  termKey: string;
  children?: React.ReactNode;
  className?: string;
}

export function GlossaryTerm({ termKey, children, className }: GlossaryTermProps) {
  const entry: GlossaryEntry | undefined = GLOSSARY[termKey];
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<"above" | "below">("below");
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 200);
  }, [cancelClose]);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setPosition(spaceBelow < 200 ? "above" : "below");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        tooltipRef.current && !tooltipRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("pointerdown", handleOutsideClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("pointerdown", handleOutsideClick);
    };
  }, [open]);

  useEffect(() => {
    return () => cancelClose();
  }, [cancelClose]);

  if (!entry) {
    return <span>{children || termKey}</span>;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen((v) => !v);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      setOpen((v) => !v);
    }
  };

  return (
    <span className={cn("relative inline", className)}>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={() => { cancelClose(); setOpen(true); }}
        onMouseLeave={scheduleClose}
        onFocus={() => { cancelClose(); setOpen(true); }}
        onBlur={scheduleClose}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="cursor-help border-b border-dotted border-muted-foreground/50 hover:border-primary/70 transition-colors"
      >
        {children || entry.term}
      </span>

      {open && (
        <div
          ref={tooltipRef}
          id={tooltipId}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          role="tooltip"
          className={cn(
            "absolute z-50 w-72 max-w-[90vw] rounded-xl border border-border bg-white shadow-lg p-3 text-left animate-in fade-in-0 zoom-in-95 duration-150",
            position === "above"
              ? "bottom-full mb-2 left-1/2 -translate-x-1/2"
              : "top-full mt-2 left-1/2 -translate-x-1/2"
          )}
        >
          <p className="text-xs font-semibold text-primary mb-1">{entry.term}</p>
          <p className="text-xs leading-relaxed text-foreground/80">{entry.short}</p>
          {entry.long && (
            <p className="text-[11px] leading-relaxed text-muted-foreground mt-2 pt-2 border-t border-border/50">
              {entry.long}
            </p>
          )}
        </div>
      )}
    </span>
  );
}
