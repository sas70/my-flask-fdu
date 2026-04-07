/**
 * Shared shapes for `discussions/{id}` Firestore documents.
 * Kept in sync with writes in admin API routes and packages/gradeflow-shared/discussions.js.
 */

export type DiscussionStatus =
  | "pending"
  | "rubric_generating"
  | "rubric_ready"
  | "rubric_failed"
  | "retry_rubric"
  | "analyzing"
  | "analyzed"
  | "analysis_failed"
  | "retry_analysis";

/** Rubric JSON produced by Claude — structure mirrors prompt in discussions.js */
export interface DiscussionRubricCriterion {
  description: string;
  points: number;
  excellentIndicators: string[];
  adequateIndicators: string[];
  poorIndicators: string[];
}

export interface DiscussionRubricCategory {
  name: string;
  weight: number;
  maxPoints: number;
  criteria: DiscussionRubricCriterion[];
}

export interface DiscussionRubric {
  weekNumber: number;
  title: string;
  totalPoints: number;
  categories: DiscussionRubricCategory[];
  gradingGuidelines: string;
}

export interface DiscussionInsightRedFlag {
  student: string;
  issue: string;
  quote: string;
}

export interface DiscussionInsightWrongConcept {
  concept: string;
  explanation: string;
  frequency: string;
}

export interface DiscussionInsightInstructorQuestion {
  student: string;
  question: string;
}

export interface DiscussionInsightQualityEntry {
  student: string;
  summary: string;
  standoutQuote?: string;
  issue?: string;
}

/** Insights JSON from Claude analysis — structure mirrors prompt in discussions.js */
export interface DiscussionInsights {
  overallAssessment: string;
  redFlags: DiscussionInsightRedFlag[];
  wrongConcepts: DiscussionInsightWrongConcept[];
  instructorQuestions: DiscussionInsightInstructorQuestion[];
  topHighQuality: DiscussionInsightQualityEntry[];
  topLowQuality: DiscussionInsightQualityEntry[];
  generalObservations: string[];
}

/**
 * Fields stored on a single `discussions` document (subset — omit dynamic keys).
 * Timestamps may be Firestore Timestamp in reads or ISO in JSON APIs.
 */
export interface DiscussionDocument {
  week: number;
  title: string;
  promptText: string;
  promptFileUrls?: string[];
  status: DiscussionStatus;
  error?: string;
  rubric?: DiscussionRubric;
  rubricUrl?: string;
  rubricGeneratedAt?: unknown;
  responsesText?: string;
  responsesFileName?: string;
  responsesUploadedAt?: unknown;
  insights?: DiscussionInsights;
  insightsUrl?: string;
  analyzedAt?: unknown;
}
