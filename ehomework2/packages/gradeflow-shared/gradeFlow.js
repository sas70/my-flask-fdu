const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { uploadTextToBytescale, uploadJsonToBytescale } = require("./bytescale");
const { getPrompt } = require("./prompts");
const { extractTextFromBuffer, fetchUrlBytes } = require("./documentExtract");

const GOOGLE_API_KEY = () => process.env.GOOGLE_API_KEY;

/** Google AI Studio model id for video transcription (override with GEMINI_TRANSCRIPTION_MODEL). */
const GEMINI_TRANSCRIPTION_MODEL =
  process.env.GEMINI_TRANSCRIPTION_MODEL || "gemini-2.5-flash";
const ANTHROPIC_API_KEY = () => process.env.ANTHROPIC_API_KEY;

function db() {
  return getFirestore();
}

const DEFAULT_TRANSCRIPTION_PROMPT = `You are a precise transcription assistant. Transcribe this student's homework walkthrough video completely and accurately.

Include:
- Everything the student says, verbatim
- Descriptions of any code they show or write (wrap in [CODE] tags)
- Any questions they raise (wrap in [QUESTION] tags)
- Timestamps every 2-3 minutes

Format the transcription clearly with paragraphs. Do NOT summarize — provide the full word-for-word transcription.`;

/** Strip codec/parameters so Gemini accepts e.g. video/webm (not video/webm;codecs=vp9,opus). */
function normalizeGeminiVideoMime(mimeType) {
  const raw = mimeType && String(mimeType).trim() ? String(mimeType).trim() : "video/mp4";
  const base = raw.split(";")[0].trim().toLowerCase();
  return base || "video/mp4";
}

/** Below this size, send video as inline base64 (tab-capture chunks are typically under 5 MB). */
const GEMINI_INLINE_VIDEO_MAX_BYTES = 18 * 1024 * 1024;

/**
 * Upload bytes via Gemini Files API (resumable) and return a file URI for generateContent.
 * @param {Buffer} buf
 * @param {string} mimeType
 * @param {string} apiKey
 */
async function uploadVideoBytesToGeminiFiles(buf, mimeType, apiKey) {
  const numBytes = buf.length;
  const base = "https://generativelanguage.googleapis.com/upload/v1beta/files";
  const startUrl = `${base}?key=${encodeURIComponent(apiKey)}`;
  const startRes = await fetch(startUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(numBytes),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file: { displayName: `transcribe_${Date.now()}.bin` },
    }),
  });
  if (!startRes.ok) {
    const t = await startRes.text();
    throw new Error(`Gemini Files API start failed (${startRes.status}): ${t}`);
  }
  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new Error("Gemini Files API: missing x-goog-upload-url");
  }
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(numBytes),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: buf,
  });
  if (!uploadRes.ok) {
    const t = await uploadRes.text();
    throw new Error(`Gemini Files API upload failed (${uploadRes.status}): ${t}`);
  }
  const uploadJson = await uploadRes.json();
  const name = uploadJson.file?.name;
  if (!name) {
    throw new Error("Gemini Files API: missing file.name in upload response");
  }
  let fileMeta = uploadJson.file;
  for (let i = 0; i < 180; i++) {
    if (fileMeta?.state === "ACTIVE" && fileMeta?.uri) {
      return fileMeta.uri;
    }
    if (fileMeta?.state === "FAILED") {
      throw new Error("Gemini Files API: video processing FAILED");
    }
    await new Promise((r) => setTimeout(r, 2000));
    const g = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${name}?key=${encodeURIComponent(apiKey)}`
    );
    if (!g.ok) {
      const t = await g.text();
      throw new Error(`Gemini Files API get failed (${g.status}): ${t}`);
    }
    fileMeta = (await g.json()).file || {};
  }
  throw new Error("Gemini Files API: timeout waiting for ACTIVE");
}

async function geminiGenerateTranscription(parts, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TRANSCRIPTION_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        maxOutputTokens: 16000,
        temperature: 0.1,
      },
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${err}`);
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned no transcription text");
  }
  return text;
}

async function transcribeWithGemini(videoUrl, mimeType = "video/mp4") {
  const customPrompt = await getPrompt("videoTranscription");
  const promptText = customPrompt || DEFAULT_TRANSCRIPTION_PROMPT;
  const mt = normalizeGeminiVideoMime(mimeType);
  const apiKey = GOOGLE_API_KEY();
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not set");
  }

  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) {
    throw new Error(`Failed to fetch video URL (${videoRes.status})`);
  }
  const arrayBuffer = await videoRes.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  if (buf.length === 0) {
    throw new Error("Video download returned empty body");
  }

  let parts;
  if (buf.length <= GEMINI_INLINE_VIDEO_MAX_BYTES) {
    parts = [
      {
        inlineData: {
          mimeType: mt,
          data: buf.toString("base64"),
        },
      },
      { text: promptText },
    ];
  } else {
    const fileUri = await uploadVideoBytesToGeminiFiles(buf, mt, apiKey);
    parts = [
      {
        fileData: {
          mimeType: mt,
          fileUri,
        },
      },
      { text: promptText },
    ];
  }

  return geminiGenerateTranscription(parts, apiKey);
}

const GRADING_INPUT_MAX = 80000;

/**
 * Markdown for the video walkthrough section when using a pre-merged transcript URL.
 * @param {string} innerUtf8 Raw body only (e.g. tab-capture merge output). Do not include the outer "## Video walkthrough…" headings — those are added here so they are not duplicated when fetching.
 * @returns {string}
 */
function buildPremergedVideoSectionMarkdown(innerUtf8) {
  const inner = String(innerUtf8 ?? "");
  return (
    "## Video walkthrough transcription(s)\n\n### Merged segment transcripts\n\n" + inner
  );
}

/**
 * Fetch pre-merged transcript bytes from ByteScale (or any HTTPS URL) and wrap with the canonical video-walkthrough headings.
 * @param {string} premergedUrl
 * @returns {Promise<string>} Full markdown section for the video part of the grading corpus
 */
async function buildPremergedVideoSectionFromUrl(premergedUrl) {
  const buf = await fetchUrlBytes(String(premergedUrl).trim());
  const text = buf.toString("utf8");
  return buildPremergedVideoSectionMarkdown(text);
}

/**
 * Video transcription (Gemini) + PDF/plain-text extraction from ByteScale URLs.
 * @param {object} submission Firestore homeworkSubmissions data
 * @param {string} submissionId
 * @returns {Promise<string>}
 */
async function buildCombinedGradingInput(submission, submissionId) {
  const videoParts = [];
  for (const v of submission.videos || []) {
    if (v && v.url) {
      videoParts.push({
        url: v.url,
        mime: v.mimeType || "video/mp4",
      });
    }
  }
  for (const u of submission.urls || []) {
    if (u) {
      videoParts.push({ url: u, mime: "video/mp4" });
    }
  }

  const attachments = submission.attachments || [];

  const sections = [];

  const premergedUrl = String(submission.premergedWalkthroughTranscriptionUrl || "").trim();
  if (premergedUrl) {
    console.log(
      `[hw submission] using premerged walkthrough transcript (skip per-video Gemini) submissionId=${submissionId}`
    );
    sections.push(await buildPremergedVideoSectionFromUrl(premergedUrl));
  } else if (videoParts.length > 0) {
    const transcriptions = [];
    for (let i = 0; i < videoParts.length; i++) {
      const { url, mime } = videoParts[i];
      console.log(
        `[hw submission] transcribe video ${i + 1}/${videoParts.length} submissionId=${submissionId}`
      );
      const text = await transcribeWithGemini(url, mime);
      transcriptions.push(`### Video part ${i + 1}\n\n${text}`);
    }
    sections.push("## Video walkthrough transcription(s)\n\n" + transcriptions.join("\n\n"));
  }

  if (attachments.length > 0) {
    const docBlocks = [];
    for (let j = 0; j < attachments.length; j++) {
      const att = attachments[j] || {};
      const name = att.name || `document_${j + 1}`;
      const url = att.url;
      const mime = att.mimeType || "";
      if (!url) continue;
      try {
        console.log(`[hw submission] extract document ${name} submissionId=${submissionId}`);
        const buf = await fetchUrlBytes(url);
        const text = await extractTextFromBuffer(buf, mime, name);
        docBlocks.push(`### ${name}\n\n${text}`);
      } catch (err) {
        console.error(`[hw submission] document extract failed ${name}:`, err);
        docBlocks.push(`### ${name}\n\n[Could not extract text: ${err.message}]`);
      }
    }
    if (docBlocks.length > 0) {
      sections.push("## Submitted documents (extracted text)\n\n" + docBlocks.join("\n\n"));
    }
  }

  return sections.join("\n\n---\n\n").substring(0, GRADING_INPUT_MAX);
}

async function buildHwRubricPrompt(assignment, instructorContext) {
  const custom = await getPrompt("hwRubricGeneration");
  if (custom) {
    return custom
      .replace(/\{\{instructorContext\}\}/g, instructorContext)
      .replace(/\{\{week\}\}/g, String(assignment.week))
      .replace(/\{\{title\}\}/g, assignment.title || `Week ${assignment.week}`)
      .replace(/\{\{description\}\}/g, assignment.description || "No description provided");
  }
  return `You are an expert teaching assistant helping create a grading rubric.

${instructorContext}

## Assignment Details
- Week: ${assignment.week}
- Title: ${assignment.title || `Week ${assignment.week}`}
- Description/Instructions:
${assignment.description || "No description provided"}

## Task
Create a detailed grading rubric for this Python programming assignment. The rubric will be used to grade student video walkthroughs (15-30 min) where they explain their code and answers.

Return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "weekNumber": ${assignment.week},
  "title": "...",
  "totalPoints": 100,
  "categories": [
    {
      "name": "Category Name",
      "weight": 25,
      "maxPoints": 25,
      "criteria": [
        {
          "description": "What to look for",
          "points": 10,
          "excellentIndicators": ["..."],
          "adequateIndicators": ["..."],
          "poorIndicators": ["..."]
        }
      ]
    }
  ],
  "bonusPoints": [
    { "description": "...", "points": 5 }
  ],
  "deductions": [
    { "description": "...", "points": -5 }
  ],
  "gradingGuidelines": "Overall approach and philosophy for grading this assignment"
}

Include categories for: Code Correctness, Explanation Quality, Code Style & Best Practices, Completeness, and any assignment-specific criteria.`;
}

async function buildHwGradingPrompt(rubric, assignment, gradingNotes, transcriptionText) {
  const custom = await getPrompt("hwGrading");
  if (custom) {
    return custom
      .replace(/\{\{rubric\}\}/g, JSON.stringify(rubric, null, 2))
      .replace(/\{\{title\}\}/g, assignment.title || `Week ${assignment.week}`)
      .replace(/\{\{description\}\}/g, assignment.description || "")
      .replace(/\{\{gradingNotes\}\}/g, gradingNotes || "No specific preferences noted.")
      .replace(/\{\{transcription\}\}/g, transcriptionText.substring(0, GRADING_INPUT_MAX));
  }
  return `You are an expert teaching assistant grading a Python programming assignment.

## Grading Rubric
${JSON.stringify(rubric, null, 2)}

## Assignment Instructions
Title: ${assignment.title || `Week ${assignment.week}`}
${assignment.description || ""}

## Instructor Grading Preferences
${gradingNotes || "No specific preferences noted."}

## Student submission (video transcription and/or submitted document text)
${transcriptionText.substring(0, GRADING_INPUT_MAX)}

## Task
Grade this student's submission based on the rubric above. Use the video transcription and any extracted document text (PDFs, written answers). Evaluate explanations, code or written work, and alignment with the assignment.

Return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "totalScore": 85,
  "totalPossible": 100,
  "letterGrade": "B+",
  "categoryScores": [
    {
      "category": "Code Correctness",
      "score": 22,
      "maxPoints": 25,
      "feedback": "Specific feedback for this category"
    }
  ],
  "overallFeedback": "2-3 paragraphs of constructive feedback covering strengths and areas for improvement",
  "strengths": ["Bullet point strengths"],
  "areasForImprovement": ["Bullet point improvements"],
  "bonusAwarded": [
    { "description": "...", "points": 5 }
  ],
  "deductionsApplied": [
    { "description": "...", "points": -5 }
  ],
  "questionsRaised": ["Any questions the student raised that the instructor should address"]
}

Be fair, constructive, and specific. Reference exact moments from the transcription when possible.`;
}

async function generateRubricWithClaude(assignment, instructorContext) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: await buildHwRubricPrompt(assignment, instructorContext),
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;

  if (!text) throw new Error("Claude returned no rubric text");

  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  return JSON.parse(cleaned);
}

async function maybeGrade(submissionId, week, transcriptionText) {
  const w = Number(week);
  if (week == null || week === "" || Number.isNaN(w)) {
    console.log(`[hw submission] skip maybeGrade submissionId=${submissionId} — invalid week: ${week}`);
    return;
  }

  const assignmentSnap = await db()
    .collection("assignments")
    .where("week", "==", w)
    .limit(1)
    .get();

  if (assignmentSnap.empty) {
    console.log(`[hw submission] No assignment for week ${w} — grading deferred submissionId=${submissionId}`);
    return;
  }

  const assignment = assignmentSnap.docs[0].data();
  if (!assignment.rubric) {
    console.log(`⏳ Rubric not yet generated for Week ${week} — grading deferred`);
    return;
  }

  console.log(`[hw submission] Grading submissionId=${submissionId} week=${w}`);
  await gradeSubmission(submissionId, transcriptionText, assignment);
}

async function gradeWaitingSubmissions(week, rubric) {
  const w = Number(week);
  if (week == null || week === "" || Number.isNaN(w)) {
    console.log(`[hw submission] gradeWaitingSubmissions skipped — invalid week: ${week}`);
    return;
  }

  const weekStr = String(week);
  const [snapStr, snapNum] = await Promise.all([
    db()
      .collection("homeworkSubmissions")
      .where("week", "==", weekStr)
      .where("status", "==", "transcribed")
      .get(),
    db()
      .collection("homeworkSubmissions")
      .where("week", "==", w)
      .where("status", "==", "transcribed")
      .get(),
  ]);

  const seen = new Set();
  const waitingDocs = [];
  for (const snap of [snapStr, snapNum]) {
    for (const doc of snap.docs) {
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        waitingDocs.push(doc);
      }
    }
  }

  if (waitingDocs.length === 0) {
    console.log(`[hw submission] No transcribed submissions waiting for week ${w}`);
    return;
  }

  console.log(`[hw submission] Batch grade ${waitingDocs.length} submission(s) for week ${w}`);

  const assignmentSnap = await db()
    .collection("assignments")
    .where("week", "==", w)
    .limit(1)
    .get();

  if (assignmentSnap.empty) {
    console.log(`[hw submission] No assignment doc for week ${w} — skip batch grade`);
    return;
  }

  const assignment = assignmentSnap.docs[0].data();

  for (const doc of waitingDocs) {
    const sub = doc.data();
    const transcription = sub.transcriptionText || "Transcription not available inline";
    await gradeSubmission(doc.id, transcription, assignment);
  }
}

async function gradeSubmission(submissionId, transcriptionText, assignment) {
  const submissionRef = db().collection("homeworkSubmissions").doc(submissionId);

  // Guard: check current status to prevent duplicate grading
  const currentDoc = await submissionRef.get();
  const currentStatus = currentDoc.data()?.status;
  if (currentStatus === "grading" || currentStatus === "graded") {
    console.log(`⏭️ Submission ${submissionId} already "${currentStatus}" — skipping`);
    return;
  }

  try {
    await submissionRef.update({ status: "grading" });

    const instrSnap = await db().collection("instructorPreferences").limit(1).get();
    let gradingNotes = "";
    if (!instrSnap.empty) {
      const instr = instrSnap.docs[0].data();
      gradingNotes = instr.notes || instr.gradingNotes || "";
    }

    const rubric = assignment.rubric;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: await buildHwGradingPrompt(rubric, assignment, gradingNotes, transcriptionText),
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude grading API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;
    if (!text) throw new Error("Claude returned no grading text");

    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const gradeResult = JSON.parse(cleaned);

    const fileName = `grades/${submissionId}_grade.json`;
    const gradeUrl = await uploadJsonToBytescale(gradeResult, fileName);

    await submissionRef.update({
      status: "graded",
      grade: gradeResult.totalScore,
      totalPossible: gradeResult.totalPossible,
      letterGrade: gradeResult.letterGrade,
      categoryScores: gradeResult.categoryScores,
      overallFeedback: gradeResult.overallFeedback,
      strengths: gradeResult.strengths,
      areasForImprovement: gradeResult.areasForImprovement,
      questionsRaised: gradeResult.questionsRaised || [],
      bonusAwarded: gradeResult.bonusAwarded || [],
      deductionsApplied: gradeResult.deductionsApplied || [],
      gradeReportUrl: gradeUrl,
      gradedAt: FieldValue.serverTimestamp(),
    });

    console.log(`✅ Graded ${submissionId}: ${gradeResult.totalScore}/${gradeResult.totalPossible} (${gradeResult.letterGrade})`);
  } catch (error) {
    console.error(`❌ Grading failed for ${submissionId}:`, error);
    await submissionRef.update({
      status: "grading_failed",
      gradingError: error.message,
    });
  }
}

async function handleSubmissionCreated(snap, submissionId) {
  const submission = snap.data();

  console.log(
    `[hw submission] onCreate submissionId=${submissionId} student=${submission.studentName} week=${submission.week}`
  );

  // Guard: skip if already being processed (prevents duplicate work on retries)
  if (submission.status && submission.status !== "pending") {
    console.log(`[hw submission] skip — status already "${submission.status}" submissionId=${submissionId}`);
    return;
  }

  const videoUrls = [
    ...(submission.videos || []).map((v) => v.url),
    ...(submission.urls || []),
  ].filter(Boolean);

  const attachments = submission.attachments || [];

  if (videoUrls.length === 0 && attachments.length === 0) {
    console.warn(`[hw submission] no videos or documents submissionId=${submissionId}`);
    await snap.ref.update({
      status: "transcription_failed",
      error:
        "No processable content. Add video URLs in videos[]/urls[] and/or PDF/text files in attachments[] (ByteScale URLs).",
    });
    return;
  }

  try {
    await snap.ref.update({ status: "transcribing", error: FieldValue.delete() });

    const fullCorpus = await buildCombinedGradingInput(submission, submissionId);

    if (!fullCorpus || !String(fullCorpus).trim()) {
      throw new Error("Combined submission text is empty after transcription and document extraction");
    }

    const fileName = `transcriptions/${submissionId}_week${submission.week}.txt`;
    const transcriptionUrl = await uploadTextToBytescale(fullCorpus, fileName);
    console.log(`[hw submission] combined text uploaded to ByteScale submissionId=${submissionId}`);

    await snap.ref.update({
      transcriptionUrl,
      transcriptionText: fullCorpus.substring(0, 80000),
      status: "transcribed",
      transcribedAt: FieldValue.serverTimestamp(),
    });

    console.log(`[hw submission] transcribed submissionId=${submissionId}`);

    await maybeGrade(submissionId, submission.week, fullCorpus);
  } catch (error) {
    console.error(`[hw submission] transcription failed submissionId=${submissionId}`, error);
    await snap.ref.update({
      status: "transcription_failed",
      error: error.message || String(error),
    });
  }
}

async function handleAssignmentCreated(snap, assignmentId) {
  const assignment = snap.data();

  console.log(`📚 New assignment: ${assignmentId} — Week ${assignment.week}`);

  // Guard: skip if rubric is already generated or being generated
  if (assignment.rubric || assignment.rubricStatus === "generating") {
    console.log(`⏭️ Assignment ${assignmentId} already has rubric or is generating — skipping`);
    return;
  }

  try {
    // Set status immediately to prevent duplicate processing
    await snap.ref.update({ rubricStatus: "generating" });

    const instrSnap = await db().collection("instructorPreferences").limit(1).get();
    let instructorContext = "";
    if (!instrSnap.empty) {
      const instr = instrSnap.docs[0].data();
      instructorContext = `
## Instructor Profile
- Name: ${instr.name || "N/A"}
- Department: ${instr.dept || instr.department || "N/A"}
- Bio: ${instr.bio || "N/A"}
- Grading Notes: ${instr.notes || instr.gradingNotes || "N/A"}

## Instructor Documents
${(instr.documents || []).map((d) => `- ${d.category}: ${d.name} (${d.url})`).join("\n")}
`;
    }

    const rubric = await generateRubricWithClaude(assignment, instructorContext);

    const fileName = `rubrics/week${assignment.week}_rubric.json`;
    const rubricUrl = await uploadJsonToBytescale(rubric, fileName);
    console.log(`☁️ Rubric uploaded to ByteScale: ${rubricUrl}`);

    await snap.ref.update({
      rubric,
      rubricUrl,
      rubricStatus: "generated",
      rubricGeneratedAt: FieldValue.serverTimestamp(),
    });

    console.log(`✅ Rubric generated for Week ${assignment.week}`);

    await gradeWaitingSubmissions(assignment.week, rubric);
  } catch (error) {
    console.error(`❌ Rubric generation failed for ${assignmentId}:`, error);
    await snap.ref.update({
      rubricStatus: "failed",
      rubricError: error.message,
    });
  }
}

async function handleSubmissionUpdated(before, after, submissionId, afterRef) {
  if (before.status !== "retry_transcription" && after.status === "retry_transcription") {
    console.log(`🔄 Retrying transcription for ${submissionId}`);
    const videoUrls = [
      ...(after.videos || []).map((v) => v.url),
      ...(after.urls || []),
    ].filter(Boolean);

    const attachments = after.attachments || [];

    if (videoUrls.length === 0 && attachments.length === 0) {
      await afterRef.update({
        status: "transcription_failed",
        error: "No videos or documents to process (videos/urls/attachments empty).",
      });
      return;
    }

    try {
      await afterRef.update({ status: "transcribing", error: FieldValue.delete() });

      const fullCorpus = await buildCombinedGradingInput(after, submissionId);
      const fileName = `transcriptions/${submissionId}_week${after.week}_retry.txt`;
      const transcriptionUrl = await uploadTextToBytescale(fullCorpus, fileName);

      await afterRef.update({
        transcriptionUrl,
        transcriptionText: fullCorpus.substring(0, 80000),
        status: "transcribed",
        transcribedAt: FieldValue.serverTimestamp(),
        error: FieldValue.delete(),
      });

      await maybeGrade(submissionId, after.week, fullCorpus);
    } catch (error) {
      await afterRef.update({
        status: "transcription_failed",
        error: error.message || String(error),
      });
    }
  }

  if (before.status !== "retry_grading" && after.status === "retry_grading") {
    console.log(`🔄 Retrying grading for ${submissionId}`);
    const transcription = after.transcriptionText;
    if (!transcription) return;

    const assignmentSnap = await db()
      .collection("assignments")
      .where("week", "==", Number(after.week))
      .limit(1)
      .get();

    if (!assignmentSnap.empty) {
      const assignment = assignmentSnap.docs[0].data();
      if (assignment.rubric) {
        await gradeSubmission(submissionId, transcription, assignment);
      }
    }
  }
}

module.exports = {
  transcribeWithGemini,
  buildPremergedVideoSectionMarkdown,
  buildPremergedVideoSectionFromUrl,
  buildCombinedGradingInput,
  generateRubricWithClaude,
  maybeGrade,
  gradeWaitingSubmissions,
  gradeSubmission,
  handleSubmissionCreated,
  handleAssignmentCreated,
  handleSubmissionUpdated,
};
