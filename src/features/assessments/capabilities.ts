export const assessmentTypes = ["rfd", "max_pull", "critical_force", "repeaters"] as const;
export type AssessmentType = (typeof assessmentTypes)[number];

export const assessmentCapabilities: Readonly<Record<AssessmentType, boolean>> = {
  rfd: true,
  max_pull: false,
  critical_force: false,
  repeaters: false,
};

export function isAssessmentEnabled(value: string): value is AssessmentType {
  return value in assessmentCapabilities && assessmentCapabilities[value as AssessmentType];
}
