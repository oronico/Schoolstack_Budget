import { InsightCallout } from "./InsightCallout";

interface FinancingInsightProps {
  text: string;
  className?: string;
}

export function FinancingInsight({ text, className }: FinancingInsightProps) {
  return <InsightCallout body={text} variant="inline" className={className} />;
}
