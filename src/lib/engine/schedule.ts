// Simple 7-day auto-scheduler: walk days in order, fill each day's free
// minutes with the next unfinished steps of the most urgent assignments,
// never scheduling a step on or after its assignment's due day.
import { dailyFreeMinutes } from "./buffer";

export interface SchedulableStep {
  assignmentId: string;
  courseCode: string;
  title: string;
  minutes: number;
  dueAt: string | null;
}

export interface ScheduledBlock extends SchedulableStep {
  dayIndex: number; // 0 = today
}

export function scheduleWeek(stepsByUrgency: SchedulableStep[], weeklyHours?: number, now = new Date()): ScheduledBlock[] {
  const capacity = dailyFreeMinutes(weeklyHours);
  const queue = [...stepsByUrgency];
  const blocks: ScheduledBlock[] = [];
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  for (let day = 0; day < 7; day++) {
    let used = 0;
    const dayEnd = startOfToday + (day + 1) * 86_400_000;
    for (let i = 0; i < queue.length; ) {
      const step = queue[i];
      const due = step.dueAt ? new Date(step.dueAt).getTime() : Infinity;
      const fits = used + step.minutes <= capacity;
      const beforeDeadline = due >= dayEnd - 86_400_000; // allowed on the due day itself
      if (fits && beforeDeadline) {
        blocks.push({ ...step, dayIndex: day });
        used += step.minutes;
        queue.splice(i, 1);
      } else {
        i++;
      }
    }
  }
  return blocks;
}
