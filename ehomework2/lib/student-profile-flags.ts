import type { DocumentData } from "firebase-admin/firestore";

/** Mirrors the Students table: bio, survey, AI profile, bulk introduction upload. */
export function getStudentProfileFlags(data: DocumentData) {
  const bio = String(data.bio || "").trim();
  const survey = data.surveyResponses as Record<string, string> | undefined;
  const hasSurvey =
    !!data.surveyReady ||
    (survey != null &&
      Object.keys(survey).some((k) => String(survey[k] || "").trim().length > 0));
  const hasProfileSummary = !!(
    data.instructorProfileSummary && String(data.instructorProfileSummary).trim()
  );
  const hasProfileError = !!(
    data.instructorProfileSummaryError && String(data.instructorProfileSummaryError).trim()
  );
  const hasIntroFromUpload = !!(
    data.introductionSourceUploadId && String(data.introductionSourceUploadId).trim()
  );

  return {
    hasBio: bio.length > 0,
    hasSurvey,
    hasProfileSummary,
    hasProfileError,
    hasIntroFromUpload,
    /** Has material for the AI briefing but no summary yet and no error recorded. */
    awaitingProfileSummary:
      (bio.length > 0 || hasSurvey) && !hasProfileSummary && !hasProfileError,
  };
}
