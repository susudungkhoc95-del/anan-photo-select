import { describe, expect, it } from "vitest";
import { dpDriveDownloadUrl } from "@/lib/drive-handoff";

describe("DP drive link", () => {
  it("accepts standard and account-specific Drive folder links", () => {
    expect(dpDriveDownloadUrl("https://drive.google.com/drive/folders/abcDEF_123-456?usp=sharing")).toBe("dpdrive://download?folder=abcDEF_123-456");
    expect(dpDriveDownloadUrl("https://drive.google.com/drive/u/0/folders/abcDEF_123-456")).toBe("dpdrive://download?folder=abcDEF_123-456");
  });
  it("rejects external hosts, files and invalid links", () => {
    for (const link of ["https://drive.google.com.evil.test/drive/folders/abcDEF_123-456", "http://drive.google.com/drive/folders/abcDEF_123-456", "https://drive.google.com/file/d/abcDEF_123-456", "broken"]) expect(dpDriveDownloadUrl(link)).toBeNull();
  });
});
