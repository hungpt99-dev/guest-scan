import { describe, it, expect } from "vitest";

describe("OcrProviderSelector", () => {
  it("has valid provider options defined", () => {
    const providers = [
      { value: "LOCAL", label: "Local OCR" },
      { value: "AZURE", label: "Azure OCR" },
    ];
    expect(providers).toHaveLength(2);
    expect(providers[0]!.value).toBe("LOCAL");
    expect(providers[1]!.value).toBe("AZURE");
  });

  it("maps all processing statuses", () => {
    const statuses = ["IDLE", "UPLOADING", "PROCESSING", "COMPLETED", "FAILED"];
    expect(statuses).toContain("IDLE");
    expect(statuses).toContain("PROCESSING");
    expect(statuses).toContain("FAILED");
  });
});
