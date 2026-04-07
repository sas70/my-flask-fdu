/**
 * GradeFlow Cloud Functions — Firestore triggers delegate to @ehomework/gradeflow-shared.
 *
 * Secrets must be created in Google Secret Manager and bound here so process.env is
 * populated in production:
 *   firebase functions:secrets:set ANTHROPIC_API_KEY
 *   firebase functions:secrets:set GOOGLE_API_KEY
 *   firebase functions:secrets:set SECRET_BYTESCALE_API_KEY
 * Then redeploy: firebase deploy --only functions
 */
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");

const {
  handleSubmissionCreated,
  handleAssignmentCreated,
  handleSubmissionUpdated,
  handleDiscussionCreated,
  handleDiscussionUpdated,
  handleSurveyCsvUploadCreated,
  handleStudentProfileCreated,
  handleStudentProfileUpdated,
  handleStudentsIntroductionUploadCreated,
} = require("@ehomework/gradeflow-shared");

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const googleApiKey = defineSecret("GOOGLE_API_KEY");
const bytescaleSecret = defineSecret("SECRET_BYTESCALE_API_KEY");

initializeApp();

setGlobalOptions({
  region: "us-central1",
  timeoutSeconds: 540,
  memory: "1GiB",
  secrets: [anthropicApiKey, googleApiKey, bytescaleSecret],
});

exports.onSubmissionCreated = onDocumentCreated(
  "homeworkSubmissions/{submissionId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    await handleSubmissionCreated(snap, event.params.submissionId);
  }
);

exports.onAssignmentCreated = onDocumentCreated(
  "assignments/{assignmentId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    await handleAssignmentCreated(snap, event.params.assignmentId);
  }
);

exports.onSubmissionUpdated = onDocumentUpdated(
  "homeworkSubmissions/{submissionId}",
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    const submissionId = event.params.submissionId;
    await handleSubmissionUpdated(before, after, submissionId, event.data.after.ref);
  }
);

// ── Discussions ──

exports.onDiscussionCreated = onDocumentCreated(
  "discussions/{discussionId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    await handleDiscussionCreated(snap, event.params.discussionId);
  }
);

exports.onDiscussionUpdated = onDocumentUpdated(
  "discussions/{discussionId}",
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    const discussionId = event.params.discussionId;
    await handleDiscussionUpdated(before, after, discussionId, event.data.after.ref);
  }
);

// ── Student questionnaire CSV + instructor profile summaries ──

exports.onStudentSurveyUploadCreated = onDocumentCreated(
  "students_survey_collection/{uploadId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    await handleSurveyCsvUploadCreated(snap, event.params.uploadId);
  }
);

exports.onStudentsIntroductionUploadCreated = onDocumentCreated(
  "students_introduction/{uploadId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    await handleStudentsIntroductionUploadCreated(snap, event.params.uploadId);
  }
);

exports.onStudentCreated = onDocumentCreated("students/{studentId}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  await handleStudentProfileCreated(snap, event.params.studentId);
});

exports.onStudentUpdated = onDocumentUpdated("students/{studentId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  await handleStudentProfileUpdated(
    before,
    after,
    event.params.studentId,
    event.data.after.ref
  );
});
