import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { TrackerMode } from "@/features/tracker/types";

const trackerModes = ["endurance", "repeater", "peak_force", "unsupported_trace"] satisfies TrackerMode[];

describe("tracker_sessions migrations", () => {
  it("allows every tracker mode emitted by the app", () => {
    const migrationsDir = join(process.cwd(), "supabase", "migrations");
    const sql = readdirSync(migrationsDir)
      .filter((filename) => filename.endsWith(".sql"))
      .sort()
      .map((filename) => readFileSync(join(migrationsDir, filename), "utf8"))
      .join("\n");

    for (const mode of trackerModes) {
      expect(sql).toContain(`'${mode}'`);
    }
  });
});
