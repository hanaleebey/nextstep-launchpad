// Side-effecting half of estimation: save a result. Kept separate so
// estimate.ts stays pure and easy to test.
import { addEstimateEvent, getAssignment, updateAssignment } from "@/lib/db";
import type { EstimateResult } from "./estimate";

/**
 * Log the estimate to estimate_events and apply it to the assignment with
 * estimate_source = 'signal'. A manual override is never overwritten:
 * the event is still logged (useful for calibration) but the assignment
 * keeps the student's number.
 */
export async function persistEstimate(assignmentId: string, itemType: string, result: EstimateResult): Promise<void> {
  await addEstimateEvent({
    assignment_id: assignmentId,
    item_type: itemType,
    estimated_minutes: result.minutes,
    actual_minutes: null,
    confidence: result.confidence,
  });

  const assignment = await getAssignment(assignmentId);
  if (!assignment || assignment.estimated_is_manual) return;

  await updateAssignment(assignmentId, {
    estimated_minutes: result.minutes,
    estimate_source: "signal",
  });
}
