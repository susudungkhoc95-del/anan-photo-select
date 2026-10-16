import { describe, expect, it } from "vitest";
import { selectionChangeSummary, selectionContentHash } from "@/lib/selection-history";

const base = {
  selectedIds: ["a", "b"],
  largePrintIds: ["a"],
  tablePrintIds: ["b"],
  photoNotes: { b: "Chỉnh da", a: "Cắt rộng" },
  albumNote: "Lưu ý chung"
};

describe("selection history", () => {
  it("creates the same hash when note object keys have a different order", () => {
    expect(selectionContentHash(base)).toBe(selectionContentHash({ ...base, photoNotes: { a: "Cắt rộng", b: "Chỉnh da" } }));
  });

  it("summarizes a real change", () => {
    expect(selectionChangeSummary(base, { ...base, selectedIds: ["a", "c"], tablePrintIds: ["c"] }))
      .toContain("ảnh +1/-1");
  });

  it("identifies an unchanged resend", () => {
    expect(selectionChangeSummary(base, base)).toBe("Không có thay đổi nội dung");
  });
});
