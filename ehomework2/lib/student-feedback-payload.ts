import type { GradeReportData } from "@/app/admin/_components/GradingReportView";

/** Stored on homeworkSubmissions.studentFeedbackReturn */
export type StudentFeedbackReturn = {
  categoryReplies: string[];
  overallParagraphReplies: string[];
  strengthItemReplies: string[];
  areaItemReplies: string[];
  generalComment: string;
};

export function splitOverallIntoParagraphs(text: string | undefined): string[] {
  if (!text?.trim()) return [];
  return text
    .trim()
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Expected array lengths for a given report (for validation / empty form). */
export function feedbackShapeForReport(report: GradeReportData): {
  categories: number;
  overallParagraphs: number;
  strengths: number;
  areas: number;
} {
  const parts = splitOverallIntoParagraphs(report.overallFeedback);
  return {
    categories: report.categoryScores?.length ?? 0,
    overallParagraphs: parts.length,
    strengths: report.strengths?.length ?? 0,
    areas: report.areasForImprovement?.length ?? 0,
  };
}

export function normalizeFeedbackPayload(
  report: GradeReportData,
  raw: Partial<StudentFeedbackReturn>
): StudentFeedbackReturn {
  const shape = feedbackShapeForReport(report);
  const opCount = splitOverallIntoParagraphs(report.overallFeedback).length;

  const clip = (s: string) => (typeof s === "string" ? s.slice(0, 12000) : "");

  const categoryReplies = padTrim(raw.categoryReplies, shape.categories, clip);
  const overallParagraphReplies = padTrim(raw.overallParagraphReplies, opCount, clip);
  const strengthItemReplies = padTrim(raw.strengthItemReplies, shape.strengths, clip);
  const areaItemReplies = padTrim(raw.areaItemReplies, shape.areas, clip);

  return {
    categoryReplies,
    overallParagraphReplies,
    strengthItemReplies,
    areaItemReplies,
    generalComment: clip(raw.generalComment ?? ""),
  };
}

function padTrim(arr: unknown, len: number, clip: (s: string) => string): string[] {
  const a = Array.isArray(arr) ? arr.map((x) => clip(String(x ?? ""))) : [];
  while (a.length < len) a.push("");
  return a.slice(0, len);
}
