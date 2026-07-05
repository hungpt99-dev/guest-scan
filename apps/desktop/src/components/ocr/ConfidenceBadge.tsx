import type { ConfidenceLevel } from "@guestfill/shared";

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  score?: number;
  className?: string;
}

const BADGE_STYLES: Record<ConfidenceLevel, string> = {
  HIGH: "bg-green-100 text-green-800 border-green-300",
  MEDIUM: "bg-yellow-100 text-yellow-800 border-yellow-300",
  LOW: "bg-red-100 text-red-800 border-red-300",
};

export function ConfidenceBadge({ level, score, className = "" }: ConfidenceBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border ${BADGE_STYLES[level]} ${className}`}
    >
      <span>{level}</span>
      {score !== undefined && <span className="opacity-60">({Math.round(score * 100)}%)</span>}
    </span>
  );
}

export function confidenceBorder(level: ConfidenceLevel): string {
  switch (level) {
    case "HIGH":
      return "border-green-300 bg-green-50";
    case "MEDIUM":
      return "border-yellow-300 bg-yellow-50";
    case "LOW":
      return "border-red-300 bg-red-50";
  }
}

export function confidenceBadge(level: ConfidenceLevel): string {
  switch (level) {
    case "HIGH":
      return "bg-green-100 text-green-800";
    case "MEDIUM":
      return "bg-yellow-100 text-yellow-800";
    case "LOW":
      return "bg-red-100 text-red-800";
  }
}
