import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { trackCoachingEvent } from "@/lib/coaching/track";
import {
  BOOKKEEPING_TRANSLATIONS,
  STATEMENT_LABELS,
  type StatementKind,
} from "@/lib/coaching/bookkeeping-translations";
import { GlossaryTerm } from "./GlossaryTerm";
import { cn } from "@/lib/utils";

interface WhatThisMeansInYourBooksProps {
  step: number;
  schoolType?: string;
  className?: string;
}

const STATEMENT_BADGE_CLASSES: Record<StatementKind, string> = {
  pl: "bg-emerald-100 text-emerald-800",
  balance_sheet: "bg-sky-100 text-sky-800",
  cash_flow: "bg-amber-100 text-amber-800",
  memo: "bg-slate-100 text-slate-700",
};

export function WhatThisMeansInYourBooks({
  step,
  schoolType,
  className,
}: WhatThisMeansInYourBooksProps) {
  const { user } = useAuth();
  const level =
    (user?.guidanceLevel as "advanced" | "basics" | "extra") || "basics";
  const entry = BOOKKEEPING_TRANSLATIONS[step];
  const defaultOpen = level !== "advanced";
  const [openByStep, setOpenByStep] = useState<Record<number, boolean>>({});
  const open = openByStep[step] ?? defaultOpen;

  const trackedRef = useRef<string>("");
  useEffect(() => {
    if (!entry) return;
    const key = `step-${step}`;
    if (trackedRef.current === key) return;
    trackedRef.current = key;
    trackCoachingEvent("bookkeeping_sidebar_shown", {
      step,
      guidanceLevel: level,
      lineCount: entry.lines.length,
    });
  }, [step, level, entry]);

  if (!entry) return null;

  return (
    <div
      data-testid={`bookkeeping-sidebar-step-${step}`}
      className={cn(
        "rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50/70 to-emerald-50/50 shadow-sm",
        className,
      )}
    >
      <button
        type="button"
        onClick={() =>
          setOpenByStep((prev) => ({
            ...prev,
            [step]: !(prev[step] ?? defaultOpen),
          }))
        }
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="shrink-0 rounded-lg bg-teal-100 p-1.5">
            <BookOpen className="h-4 w-4 text-teal-700" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              What this means in your books
            </p>
            <p className="text-[11px] text-muted-foreground hidden sm:block">
              How this step shows up on your P&amp;L, balance sheet, or cash flow.
            </p>
          </div>
        </div>
        <div className="shrink-0 text-teal-700">
          {open ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <p className="text-xs leading-relaxed text-foreground/80">
            {entry.intro}
          </p>
          <ul className="space-y-2">
            {entry.lines.map((line, i) => (
              <li
                key={i}
                className="rounded-lg border border-teal-200/60 bg-white/70 px-3 py-2 text-xs"
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <p className="font-semibold text-foreground leading-snug">
                    {line.glossaryKey ? (
                      <GlossaryTerm
                        termKey={line.glossaryKey}
                        schoolType={schoolType}
                      >
                        {line.label}
                      </GlossaryTerm>
                    ) : (
                      line.label
                    )}
                  </p>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      STATEMENT_BADGE_CLASSES[line.statement],
                    )}
                  >
                    {STATEMENT_LABELS[line.statement]}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground leading-snug">
                  → {line.account}
                </p>
                {line.note && (
                  <p className="mt-1 text-[11px] italic text-muted-foreground/90 leading-snug">
                    {line.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {entry.footnote && (
            <p className="text-[11px] italic text-muted-foreground leading-relaxed border-t border-teal-200/50 pt-2">
              {entry.footnote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
