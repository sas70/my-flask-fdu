import type { DocumentData, Firestore } from "firebase-admin/firestore";
import type { GradeReportData } from "@/app/admin/_components/GradingReportView";

export type GradingLetterhead = {
  courseName: string;
  instructorName: string;
  instructorEmail: string;
  reportDateLabel: string;
  weekLine?: string;
};

export function reportFromFirestore(sub: DocumentData): GradeReportData {
  return {
    totalScore: sub.grade,
    totalPossible: sub.totalPossible,
    letterGrade: sub.letterGrade,
    categoryScores: sub.categoryScores,
    overallFeedback: sub.overallFeedback,
    strengths: sub.strengths,
    areasForImprovement: sub.areasForImprovement,
    questionsRaised: sub.questionsRaised,
    bonusAwarded: sub.bonusAwarded,
    deductionsApplied: sub.deductionsApplied,
  };
}

/** Load merged grade JSON from ByteScale URL or Firestore fields. */
export async function loadGradeReportForSubmission(
  sub: DocumentData
): Promise<GradeReportData | null> {
  const gradeReportUrl = typeof sub.gradeReportUrl === "string" ? sub.gradeReportUrl : undefined;
  let report: GradeReportData | null = null;

  if (gradeReportUrl) {
    try {
      const res = await fetch(gradeReportUrl, { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as GradeReportData;
        if (json && typeof json === "object") {
          report = json;
        }
      }
    } catch {
      // fall through
    }
  }

  if (!report && sub.grade != null && sub.totalPossible != null) {
    report = reportFromFirestore(sub);
  }
  return report;
}

/** Letterhead for PDF / student page (course, instructor, week line). */
export async function buildGradingLetterhead(
  db: Firestore,
  sub: DocumentData,
  opts?: { reportDate?: Date }
): Promise<GradingLetterhead> {
  const week = typeof sub.week === "number" ? sub.week : undefined;

  const instrSnap = await db.collection("instructorPreferences").doc("default").get();
  const instr = instrSnap.exists ? (instrSnap.data() as DocumentData) : {};

  const courseName =
    (typeof instr.courseName === "string" && instr.courseName.trim()) ||
    process.env.NEXT_PUBLIC_HOMEWORK_COURSE_NAME?.trim() ||
    (typeof instr.dept === "string" && instr.dept.trim()) ||
    "Course";

  const instructorName = typeof instr.name === "string" ? instr.name.trim() : "";
  const instructorEmail = typeof instr.email === "string" ? instr.email.trim() : "";

  const d = opts?.reportDate ?? new Date();
  const reportDateLabel = d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let assignmentTitle: string | undefined;
  if (week != null) {
    const aq = await db.collection("assignments").where("week", "==", week).limit(1).get();
    if (!aq.empty) {
      const t = aq.docs[0].data().title;
      if (typeof t === "string" && t.trim()) assignmentTitle = t.trim();
    }
  }

  const weekLine =
    week != null
      ? assignmentTitle
        ? `Week ${week} — ${assignmentTitle}`
        : `Week ${week}`
      : undefined;

  return {
    courseName,
    instructorName,
    instructorEmail,
    reportDateLabel,
    weekLine,
  };
}
