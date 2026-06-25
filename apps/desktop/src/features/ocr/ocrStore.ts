import type { OcrJob } from "./ocrTypes";

const jobs = new Map<string, OcrJob>();

export function addJob(job: OcrJob): void {
  jobs.set(job.jobId, job);
}

export function getJob(jobId: string): OcrJob | undefined {
  return jobs.get(jobId);
}

export function getAllJobs(): OcrJob[] {
  return Array.from(jobs.values());
}

export function updateJob(jobId: string, updates: Partial<OcrJob>): void {
  const existing = jobs.get(jobId);
  if (existing) {
    jobs.set(jobId, { ...existing, ...updates });
  }
}
