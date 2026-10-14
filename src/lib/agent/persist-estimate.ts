// Side-effecting half of estimation: save a result. Kept separate so
// estimate.ts stays pure and easy to test.
import { addEstimateEvent, getAssignment, updateAssignment } from "@/lib/db";
import { refineEstimate, type EstimateResult, type RefineContext, type RefinedEstimate } from "./estimate";
import { saveGeneratedSteps } from "./ai-steps-persist";

/**
 * Log the estimate to estimate_events and apply it to the assignment with
 * estimate_source = 'signal'. A manual override is never overwritten:
 * the event is still logged (useful for calibration) but the assignment
 * keeps the student's number. AI-refined results set ai_refined = true and
 * replace the assignment's not-started steps with the AI steps.
 */
export async function persistEstimate(assignmentId: string, itemType: string, result: EstimateResult | RefinedEstimate): Promise<void> {
  const refined = "aiRefined" in result && result.aiRefined;
  await addEstimateEvent({
    assignment_id: assignmentId,
    item_type: itemType,
    estimated_minutes: result.minutes,
    actual_minutes: null,
    confidence: result.confidence,
    ai_refined: refined,
  });

  const assignment = await getAssignment(assignmentId);
  if (!assignment) return;
  if (refined && result.steps?.length) {
    await saveGeneratedSteps(assignmentId, assignment.title, result.steps, "ai");
  }
  if (assignment.estimated_is_manual) return;

  await updateAssignment(assignmentId, {
    estimated_minutes: result.minutes,
    estimate_source: "signal",
  });
}

/** Estimate → optional AI refine → save. Never throws because of the model. */
export async function estimateRefineAndPersist(assignmentId: string, itemType: string, base: EstimateResult, ctx: RefineContext): Promise<RefinedEstimate> {
  const result = await refineEstimate(base, ctx);
  await persistEstimate(assignmentId, itemType, result);
  return result;
}
