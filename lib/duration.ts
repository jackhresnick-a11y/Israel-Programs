import type { DurationType } from "@/app/generated/prisma/enums";

export const DURATION_LABELS: Record<DurationType, string> = {
  TEN_DAY: "10-Day Trip",
  SUMMER: "Summer Program",
  SEMESTER: "Semester",
  GAP_YEAR: "Gap Year",
  CUSTOM: "Custom",
};
