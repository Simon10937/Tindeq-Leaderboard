import { z } from "zod";
import { isAssessmentEnabled } from "@/features/assessments/capabilities";
import type { RfdProtocolDraft } from "./types";

const instruction = z.string().trim().min(8).max(2_000);

const rfdProtocolSchema = z
  .object({
    assessmentType: z.literal("rfd"),
    name: z.string().trim().min(3).max(100),
    gripType: z.enum(["open_hand", "half_crimp", "full_crimp", "three_finger_drag", "pinch", "other"]),
    edgeDepthMm: z.number().positive().max(100),
    setupInstructions: instruction,
    warmupInstructions: instruction,
    bodyPosition: instruction,
    devicePlacement: instruction,
    executionInstructions: instruction,
    maximumAttempts: z.number().int().min(1).max(10),
    minimumRecoverySeconds: z.number().int().min(0).max(3_600),
    bestOf: z.number().int().min(1).max(10),
    minimumValidDurationMs: z.number().int().min(100).max(60_000),
    lowerPercent: z.number().min(1).max(98),
    upperPercent: z.number().min(2).max(99),
    minimumPeakForceN: z.number().positive().max(10_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.bestOf > value.maximumAttempts) {
      context.addIssue({ code: "custom", path: ["bestOf"], message: "bestOf cannot exceed maximumAttempts" });
    }
    if (value.lowerPercent >= value.upperPercent) {
      context.addIssue({ code: "custom", path: ["upperPercent"], message: "upperPercent must exceed lowerPercent" });
    }
  });

export function parseProtocolDraft(input: unknown): RfdProtocolDraft {
  const assessmentType = typeof input === "object" && input !== null ? Reflect.get(input, "assessmentType") : undefined;
  if (typeof assessmentType !== "string" || !isAssessmentEnabled(assessmentType)) {
    throw new Error(`Assessment type ${String(assessmentType)} is not enabled`);
  }
  return rfdProtocolSchema.parse(input);
}
