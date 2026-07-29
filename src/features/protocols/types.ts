import type { AssessmentType } from "@/features/assessments/capabilities";

export type GripType = "open_hand" | "half_crimp" | "full_crimp" | "three_finger_drag" | "pinch" | "other";

export type RfdProtocolDraft = {
  assessmentType: Extract<AssessmentType, "rfd">;
  name: string;
  gripType: GripType;
  edgeDepthMm: number;
  setupInstructions: string;
  warmupInstructions: string;
  bodyPosition: string;
  devicePlacement: string;
  executionInstructions: string;
  maximumAttempts: number;
  minimumRecoverySeconds: number;
  bestOf: number;
  minimumValidDurationMs: number;
  lowerPercent: number;
  upperPercent: number;
  minimumPeakForceN: number;
};
