import { useAuth } from "@/lib/auth-context";
import { getExplainersForSection, type GuidanceLevel } from "@/lib/coaching/explainers";
import { InlineHelpCard } from "./InlineHelpCard";

interface SectionExplainersProps {
  section: string;
  className?: string;
}

export function SectionExplainers({ section, className }: SectionExplainersProps) {
  const { user } = useAuth();
  const level = (user?.guidanceLevel as GuidanceLevel) || "basics";
  const explainers = getExplainersForSection(section, level);

  if (explainers.length === 0) return null;

  return (
    <div className={className}>
      <div className="space-y-2">
        {explainers.map((e) => (
          <InlineHelpCard key={e.id} explainer={e} section={section} />
        ))}
      </div>
    </div>
  );
}
