import { describe, expect, it } from "vitest";
import { createDraftsFromCsvFiles } from "./tracker-app";

describe("createDraftsFromCsvFiles", () => {
  it("uses Tindeq info.csv as metadata for the data CSV", () => {
    const drafts = createDraftsFromCsvFiles([
      {
        filename: "repeaters.zip / info.csv",
        byteSize: 212,
        source: "date,tag,comment,unit,reps,work dur.,pause btw. reps,sets,pause btw. sets,type,mvc,Work Level (% of mvc),Rest level (% of mvc)\n2026-20-08 19:55:38,rehab half crimp 1.5kg,,SI,8,10,20,1,120,single,1.8000000,80,15\n",
      },
      {
        filename: "repeaters.zip / data_set_1.csv",
        byteSize: 567414,
        source: ",Overall Avg\nAvg,0.0\nPeak,0.0\n,\ntime,weight\n0.054067,0.009124040603637695\n0.065411,0.008312106132507324\n",
      },
    ], "file", 1);

    expect(drafts).toHaveLength(1);
    expect(drafts[0].filename).toBe("repeaters.zip / data_set_1.csv");
    expect(drafts[0].grip).toBe("rehab half crimp");
    expect(drafts[0].testedAt).toBe("2026-08-20T19:55");
    expect(drafts[0].parsed?.mode).toBe("repeater");
    expect(drafts[0].notes).toContain("Tindeq tag: rehab half crimp 1.5kg");
    expect(drafts[0].notes).toContain("8 reps");
  });

  it("requires an explicit grip choice for unknown Tindeq tags", () => {
    const drafts = createDraftsFromCsvFiles([
      {
        filename: "repeaters.zip / info.csv",
        byteSize: 212,
        source: "date,tag,comment,unit,reps,work dur.,pause btw. reps,sets,pause btw. sets,type,mvc,Work Level (% of mvc),Rest level (% of mvc)\n2026-20-08 19:55:38,mystery grip 3kg,,SI,8,10,20,1,120,single,1.8000000,80,15\n",
      },
      {
        filename: "repeaters.zip / data_set_1.csv",
        byteSize: 567414,
        source: ",Overall Avg\nAvg,0.0\nPeak,0.0\n,\ntime,weight\n0.054067,0.009124040603637695\n0.065411,0.008312106132507324\n",
      },
    ], "file", 1);

    expect(drafts[0].grip).toBe("");
    expect(drafts[0].notes).toContain("Tindeq tag: mystery grip 3kg");
  });
});
