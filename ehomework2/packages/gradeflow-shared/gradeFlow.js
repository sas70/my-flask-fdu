const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { uploadTextToBytescale, uploadJsonToBytescale } = require("./bytescale");
const { getPrompt } = require("./prompts");

const GOOGLE_API_KEY = () => process.env.GOOGLE_API_KEY;
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

async function transcribeWithGemini(videoUrl) {
  const customPrompt = await getPrompt("videoTranscription");
  const promptText = customPrompt || DEFAULT_TRANSCRIPTION_PROMPT;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY()}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              fileData: {
                mimeType: "video/mp4",
                fileUri: videoUrl,
              },
            },
            {
              text: promptText,
            },
          ],
        },
      ],
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
      .replace(/\{\{transcription\}\}/g, transcriptionText.substring(0, 40000));
  }
  return `You are an expert teaching assistant grading a Python programming assignment.

## Grading Rubric
${JSON.stringify(rubric, null, 2)}

## Assignment Instructions
Title: ${assignment.title || `Week ${assignment.week}`}
${assignment.description || ""}

## Instructor Grading Preferences
${gradingNotes || "No specific preferences noted."}

## Student Video Transcription
${transcriptionText.substring(0, 40000)}

## Task
Grade this student's submission based on the rubric above. Evaluate what they said, the code they showed, and the quality of their explanations.

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
  const assignmentSnap = await db()
    .collection("assignments")
    .where("week", "==", Number(week))
    .limit(1)
    .get();

  if (assignmentSnap.empty) {
    console.log(`⏳ No assignment found for Week ${week} — grading deferred`);
    return;
  }

  const assignment = assignmentSnap.docs[0].data();
  if (!assignment.rubric) {
    console.log(`⏳ Rubric not yet generated for Week ${week} — grading deferred`);
    return;
  }

  console.log(`🎯 Both ready! Grading submission ${submissionId} for Week ${week}`);
  await gradeSubmission(submissionId, transcriptionText, assignment);
}

async function gradeWaitingSubmissions(week, rubric) {
  const waitingSnap = await db()
    .collection("homeworkSubmissions")
    .where("week", "==", String(week))
    .where("status", "==", "transcribed")
    .get();

  if (waitingSnap.empty) {
    console.log(`📋 No transcribed submissions waiting for Week ${week}`);
    return;
  }

  console.log(`🎯 Found ${waitingSnap.size} submissions to grade for Week ${week}`);

  const assignmentSnap = await db()
    .collection("assignments")
    .where("week", "==", Number(week))
    .limit(1)
    .get();

  const assignment = assignmentSnap.docs[0].data();

  for (const doc of waitingSnap.docs) {
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

  console.log(`📹 New submission: ${submissionId} — ${submission.studentName}, Week ${submission.week}`);

  // Guard: skip if already being processed (prevents duplicate work on retries)
  if (submission.status && submission.status !== "pending") {
    console.log(`⏭️ Submission ${submissionId} already has status "${submission.status}" — skipping`);
    return;
  }

  try {
    // Set status immediately to prevent duplicate processing
    await snap.ref.update({ status: "transcribing" });

    const videoUrls = [
      ...(submission.videos || []).map((v) => v.url),
      ...(submission.urls || []),
    ].filter(Boolean);

    if (videoUrls.length === 0) {
      console.warn("⚠️ No video URLs found in submission");
      return;
    }

    const transcriptions = [];
    for (let i = 0; i < videoUrls.length; i++) {
      const url = videoUrls[i];
      console.log(`🎙️ Transcribing video ${i + 1}/${videoUrls.length}: ${url}`);
      const text = await transcribeWithGemini(url);
      transcriptions.push(`--- Part ${i + 1} ---\n${text}`);
    }

    const fullTranscription = transcriptions.join("\n\n");

    const fileName = `transcriptions/${submissionId}_week${submission.week}.txt`;
    const transcriptionUrl = await uploadTextToBytescale(fullTranscription, fileName);
    console.log(`☁️ Transcription uploaded to ByteScale: ${transcriptionUrl}`);

    await snap.ref.update({
      transcriptionUrl,
      transcriptionText: fullTranscription.substring(0, 50000),
      status: "transcribed",
      transcribedAt: FieldValue.serverTimestamp(),
    });

    console.log(`✅ Submission ${submissionId} transcribed`);

    await maybeGrade(submissionId, submission.week, fullTranscription);
  } catch (error) {
    console.error(`❌ Transcription failed for ${submissionId}:`, error);
    await snap.ref.update({
      status: "transcription_failed",
      error: error.message,
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

    if (videoUrls.length === 0) return;

    try {
      const transcriptions = [];
      for (let i = 0; i < videoUrls.length; i++) {
        const text = await transcribeWithGemini(videoUrls[i]);
        transcriptions.push(`--- Part ${i + 1} ---\n${text}`);
      }
      const fullTranscription = transcriptions.join("\n\n");
      const fileName = `transcriptions/${submissionId}_week${after.week}_retry.txt`;
      const transcriptionUrl = await uploadTextToBytescale(fullTranscription, fileName);

      await afterRef.update({
        transcriptionUrl,
        transcriptionText: fullTranscription.substring(0, 50000),
        status: "transcribed",
        transcribedAt: FieldValue.serverTimestamp(),
        error: FieldValue.delete(),
      });

      await maybeGrade(submissionId, after.week, fullTranscription);
    } catch (error) {
      await afterRef.update({
        status: "transcription_failed",
        error: error.message,
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
  generateRubricWithClaude,
  maybeGrade,
  gradeWaitingSubmissions,
  gradeSubmission,
  handleSubmissionCreated,
  handleAssignmentCreated,
  handleSubmissionUpdated,
};
