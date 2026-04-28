import { useParams } from "wouter";
import { AddProgramFlow } from "./AddProgramFlow";
import { EvaluateSiteFlow } from "./EvaluateSiteFlow";
import { ChangeEnrollmentFlow } from "./ChangeEnrollmentFlow";
import NotFound from "../not-found";

const URL_TO_TYPE: Record<string, "add_program" | "evaluate_site" | "change_enrollment"> = {
  "add-program": "add_program",
  "evaluate-site": "evaluate_site",
  "change-enrollment": "change_enrollment",
};

export function DecisionFlowDispatcher() {
  const params = useParams<{ type: string; modelId: string }>();
  const type = URL_TO_TYPE[params.type ?? ""];
  const modelId = parseInt(params.modelId ?? "", 10);

  if (!type || !modelId || isNaN(modelId)) {
    return <NotFound />;
  }

  if (type === "add_program") return <AddProgramFlow modelId={modelId} />;
  if (type === "evaluate_site") return <EvaluateSiteFlow modelId={modelId} />;
  return <ChangeEnrollmentFlow modelId={modelId} />;
}
