import { useState, useEffect, useMemo, useRef } from "react";
import { X, Lightbulb, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTriggeredLessons, dismissLesson, type MicroLesson } from "@/lib/coaching/micro-lessons";
import type { FullModelData } from "@/pages/model-wizard/schema";
import { useAuth } from "@/lib/auth-context";
import { trackCoachingEvent } from "@/lib/coaching/track";

interface MicroLessonContainerProps {
  data: FullModelData;
  // Title of the wizard step currently being rendered (e.g. "Expenses").
  // The wizard resolves the visible step list to a title at render time so
  // that lessons fire on the correctly-named step regardless of model
  // duration or school-type variant — see `getTriggeredLessons` for the
  // matching rules and skip-on-missing semantics.
  currentStepTitle: string;
  className?: string;
}

export function MicroLessonCardInner({ lesson, onDismiss }: { lesson: MicroLesson; onDismiss: (id: string) => void }) {
  return (
    <div className="rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50/80 to-emerald-50/60 p-4 shadow-sm animate-in slide-in-from-top-2 fade-in duration-300">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-lg bg-teal-100 p-1.5 mt-0.5">
          <Lightbulb className="h-4 w-4 text-teal-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <h4 className="text-sm font-semibold text-foreground">{lesson.title}</h4>
            <button
              type="button"
              onClick={() => {
                trackCoachingEvent("micro_lesson_dismissed", {
                  lessonId: lesson.id,
                });
                dismissLesson(lesson.id);
                onDismiss(lesson.id);
              }}
              className="shrink-0 rounded-md p-1 text-muted-foreground/60 hover:text-muted-foreground hover:bg-black/5 transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {lesson.body}
          </p>
          <div className="flex items-center gap-1 mt-2 text-teal-600/70">
            <Clock className="h-3 w-3" />
            <span className="text-[11px] font-medium">{lesson.readTimeSeconds}s read</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MicroLessonContainer({ data, currentStepTitle, className }: MicroLessonContainerProps) {
  const { user } = useAuth();
  const level = (user?.guidanceLevel as "advanced" | "basics" | "extra") || "basics";
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const lessons = useMemo(() => {
    return getTriggeredLessons(data, currentStepTitle, level).filter(l => !dismissedIds.has(l.id));
  }, [data, currentStepTitle, dismissedIds, level]);

  const trackedRef = useRef<string>("");
  useEffect(() => {
    if (lessons.length === 0) return;
    const key = lessons.map(l => l.id).join(",");
    if (key === trackedRef.current) return;
    trackedRef.current = key;
    for (const lesson of lessons) {
      trackCoachingEvent("micro_lesson_shown", {
        lessonId: lesson.id,
        step: currentStepTitle,
        guidanceLevel: level,
      });
    }
  }, [lessons, currentStepTitle, level]);

  if (level === "advanced" || lessons.length === 0) return null;

  const handleDismiss = (id: string) => {
    setDismissedIds(prev => new Set([...prev, id]));
  };

  return (
    <div className={cn("space-y-2", className)}>
      {lessons.slice(0, 2).map((lesson) => (
        <MicroLessonCardInner
          key={lesson.id}
          lesson={lesson}
          onDismiss={handleDismiss}
        />
      ))}
    </div>
  );
}
