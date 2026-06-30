import { describe, it, expect, beforeEach } from "vitest";
import { addJob, getJob, getAllJobs, updateJob, clearJobs } from "../../../features/ocr/ocrStore";
import type { OcrJob } from "../../../features/ocr/ocrTypes";

describe("OCR Store E2E: job lifecycle", () => {
  beforeEach(() => {
    clearJobs();
  });

  function createJob(overrides?: Partial<OcrJob>): OcrJob {
    return {
      jobId: `job-${crypto.randomUUID().slice(0, 8)}`,
      status: "IDLE",
      inputFiles: [],
      createdAt: new Date().toISOString(),
      ...overrides,
    };
  }

  it("adds and retrieves a job", () => {
    const job = createJob({ inputFiles: ["passport.jpg"] });
    addJob(job);
    const retrieved = getJob(job.jobId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.jobId).toBe(job.jobId);
    expect(retrieved?.inputFiles).toEqual(["passport.jpg"]);
  });

  it("tracks status transitions: IDLE -> PROCESSING -> COMPLETED", () => {
    const job = createJob();
    addJob(job);
    expect(getJob(job.jobId)?.status).toBe("IDLE");
    updateJob(job.jobId, { status: "PROCESSING" });
    expect(getJob(job.jobId)?.status).toBe("PROCESSING");
    updateJob(job.jobId, {
      status: "COMPLETED",
      completedAt: new Date().toISOString(),
      summary: {
        totalFiles: 1,
        totalDocuments: 1,
        ready: 1,
        needReview: 0,
        failed: 0,
        averageConfidence: 0.95,
      },
    });
    expect(getJob(job.jobId)?.status).toBe("COMPLETED");
    expect(getJob(job.jobId)?.summary?.averageConfidence).toBe(0.95);
    expect(getJob(job.jobId)?.completedAt).toBeDefined();
  });

  it("handles status transition: IDLE -> PROCESSING -> FAILED", () => {
    const job = createJob({ inputFiles: ["corrupt.pdf"] });
    addJob(job);
    updateJob(job.jobId, { status: "PROCESSING" });
    updateJob(job.jobId, { status: "FAILED", completedAt: new Date().toISOString() });
    expect(getJob(job.jobId)?.status).toBe("FAILED");
  });

  it("returns undefined for unknown job", () => {
    expect(getJob("nonexistent")).toBeUndefined();
  });

  it("lists all jobs", () => {
    const j1 = createJob({ inputFiles: ["a.jpg"] });
    const j2 = createJob({ inputFiles: ["b.jpg"] });
    const j3 = createJob({ inputFiles: ["c.jpg"] });
    addJob(j1);
    addJob(j2);
    addJob(j3);
    expect(getAllJobs()).toHaveLength(3);
  });

  it("preserves fields not included in update", () => {
    const job = createJob({ inputFiles: ["test.jpg"], outputPath: "/out/test.xlsx" });
    addJob(job);
    updateJob(job.jobId, { status: "PROCESSING" });
    const updated = getJob(job.jobId);
    expect(updated?.outputPath).toBe("/out/test.xlsx");
    expect(updated?.inputFiles).toEqual(["test.jpg"]);
  });

  it("does not update non-existent job silently", () => {
    updateJob("phantom", { status: "COMPLETED" });
    expect(getAllJobs()).toHaveLength(0);
  });

  it("handles concurrent jobs with different statuses", () => {
    const j1 = createJob({ inputFiles: ["a.jpg"], status: "IDLE" });
    const j2 = createJob({ inputFiles: ["b.jpg"], status: "PROCESSING" });
    const j3 = createJob({ inputFiles: ["c.jpg"], status: "COMPLETED" });
    addJob(j1);
    addJob(j2);
    addJob(j3);
    expect(getJob(j1.jobId)?.status).toBe("IDLE");
    expect(getJob(j2.jobId)?.status).toBe("PROCESSING");
    expect(getJob(j3.jobId)?.status).toBe("COMPLETED");
  });

  it("handles job with no input files", () => {
    const job = createJob();
    addJob(job);
    expect(getJob(job.jobId)?.inputFiles).toEqual([]);
  });
});
