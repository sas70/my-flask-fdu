/**
 * GradeFlow Cloud Functions — Firestore triggers delegate to @ehomework/gradeflow-shared.
 */
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");

const {
  handleSubmissionCreated,
  handleAssignmentCreated,
  handleSubmissionUpdated,
  handleDiscussionCreated,
  handleDiscussionUpdated,
} = require("@ehomework/gradeflow-shared");

initializeApp();

setGlobalOptions({ region: "us-central1", timeoutSeconds: 540, memory: "1GiB" });

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
