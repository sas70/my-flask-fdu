/**
 * Discussions pipeline — rubric generation + response analysis.
 * Mirrors the homework gradeFlow pattern but produces instructor insights
 * instead of per-student grades.
 */
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { uploadTextToBytescale, uploadJsonToBytescale } = require("./bytescale");
const { getPrompt } = require("./prompts");

const ANTHROPIC_API_KEY = () => process.env.ANTHROPIC_API_KEY;

/* ------------------------------------------------------------------ */
/*  Prompt builders — use Firestore overrides or fall back to defaults */
/* ------------------------------------------------------------------ */

async function buildDiscussionRubricPrompt(discussion, instructorContext) {
  const custom = await getPrompt("discussionRubricGeneration");
  if (custom) {
    return custom
      .replace(/\{\{instructorContext\}\}/g, instructorContext)
      .replace(/\{\{week\}\}/g, String(discussion.week))
      .replace(/\{\{title\}\}/g, discussion.title || `Week ${discussion.week} Discussion`)
      .replace(/\{\{promptText\}\}/g, discussion.promptText || "No prompt provided");
  }
  return `You are an expert teaching assistant helping create a grading rubric for a class discussion.

${instructorContext}

## Discussion Details
- Week: ${discussion.week}
- Title: ${discussion.title || `Week ${discussion.week} Discussion`}
- Discussion Prompt / Instructions:
${discussion.promptText || "No prompt provided"}

## Task
Create a detailed rubric for evaluating student discussion posts and peer replies.
Students are expected to write an initial response to the prompt AND reply to at least one peer.

Return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "weekNumber": ${discussion.week},
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
  "gradingGuidelines": "Overall approach for evaluating discussion quality"
}

Include categories for: Content Quality & Depth, Critical Thinking, Peer Engagement & Replies, Use of Evidence/Examples, and Writing Clarity.`;
}

async function buildDiscussionAnalysisPrompt(discussion, gradingNotes) {
  const custom = await getPrompt("discussionAnalysis");
  if (custom) {
    return custom
      .replace(/\{\{rubric\}\}/g, JSON.stringify(discussion.rubric, null, 2))
      .replace(/\{\{title\}\}/g, discussion.title || `Week ${discussion.week} Discussion`)
      .replace(/\{\{promptText\}\}/g, discussion.promptText || "")
      .replace(/\{\{gradingNotes\}\}/g, gradingNotes || "No specific preferences noted.")
      .replace(/\{\{responsesText\}\}/g, (discussion.responsesText || "").substring(0, 80000));
  }
  return `You are an expert teaching assistant analyzing student discussion responses for a college course.

## Discussion Rubric
${JSON.stringify(discussion.rubric, null, 2)}

## Discussion Prompt
Title: ${discussion.title || `Week ${discussion.week} Discussion`}
${discussion.promptText || ""}

## Instructor Grading Preferences
${gradingNotes || "No specific preferences noted."}

## Student Discussion Responses (all students)
${(discussion.responsesText || "").substring(0, 80000)}

## Task
Analyze ALL the student discussion responses above. Do NOT grade each student individually.
Instead, produce a comprehensive instructor briefing with insights across the entire class.

Return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "overallAssessment": "2-3 paragraphs summarizing the overall quality of the class discussion",
  "redFlags": [
    { "student": "Student name", "issue": "Description of concern", "quote": "Relevant quote" }
  ],
  "wrongConcepts": [
    { "concept": "The misconception", "explanation": "Why it is wrong", "frequency": "How many students" }
  ],
  "instructorQuestions": [
    { "student": "Student name", "question": "The question or comment" }
  ],
  "topHighQuality": [
    { "student": "Student name", "summary": "What made it exceptional", "standoutQuote": "Strong excerpt" }
  ],
  "topLowQuality": [
    { "student": "Student name", "summary": "What was lacking", "issue": "Specific problem" }
  ],
  "generalObservations": ["Bullet-point observations about patterns and trends"]
}

Be thorough, specific, and reference actual student names and quotes. The instructor needs actionable insights, not vague summaries.`;
}

function db() {
  return getFirestore();
}

/* ------------------------------------------------------------------ */
/*  Step 1 — Generate a discussion rubric from the prompt             */
/* ------------------------------------------------------------------ */

async function generateDiscussionRubric(discussion, instructorContext) {
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
          content: await buildDiscussionRubricPrompt(discussion, instructorContext),
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

/* ------------------------------------------------------------------ */
/*  Step 2 — Analyze all student responses against the rubric         */
/* ------------------------------------------------------------------ */

async function analyzeDiscussionResponses(discussion) {
  const instrSnap = await db().collection("instructorPreferences").limit(1).get();
  let gradingNotes = "";
  if (!instrSnap.empty) {
    const instr = instrSnap.docs[0].data();
    gradingNotes = instr.notes || instr.gradingNotes || "";
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: await buildDiscussionAnalysisPrompt(discussion, gradingNotes),
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude analysis API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("Claude returned no analysis text");

  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  return JSON.parse(cleaned);
}

/* ------------------------------------------------------------------ */
/*  Firestore trigger handlers                                        */
/* ------------------------------------------------------------------ */

async function handleDiscussionCreated(snap, docId) {
  const discussion = snap.data();

  console.log(`💬 New discussion: ${docId} — Week ${discussion.week}`);

  // Guard: skip if already processing
  if (discussion.status && discussion.status !== "pending") {
    console.log(`⏭️ Discussion ${docId} already "${discussion.status}" — skipping`);
    return;
  }

  try {
    await snap.ref.update({ status: "rubric_generating" });

    // Fetch instructor context
    console.log("1- Fetching instructor context");
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
`;
    }

    console.log("2- Generating discussion rubric");
    const rubric = await generateDiscussionRubric(discussion, instructorContext);

    const fileName = `discussion-rubrics/week${discussion.week}_rubric.json`;
    const rubricUrl = await uploadJsonToBytescale(rubric, fileName);
    console.log(`☁️ Discussion rubric uploaded: ${rubricUrl}`);

    await snap.ref.update({
      rubric,
      rubricUrl,
      status: "rubric_ready",
      rubricGeneratedAt: FieldValue.serverTimestamp(),
    });

    console.log(`✅ Discussion rubric generated for Week ${discussion.week}`);

    // If responses were already uploaded before rubric finished, analyze now
    if (discussion.responsesText) {
      console.log(`🎯 Responses already present — starting analysis`);
      const updatedDoc = await snap.ref.get();
      await runDiscussionAnalysis(docId, updatedDoc.data(), snap.ref);
    }
  } catch (error) {
    console.error(`❌ Discussion rubric failed for ${docId}:`, error);
    await snap.ref.update({
      status: "rubric_failed",
      error: error.message,
    });
  }
}

async function handleDiscussionUpdated(before, after, docId, ref) {
  // Case 1: Responses just uploaded and rubric is ready → analyze
  if (
    !before.responsesText &&
    after.responsesText &&
    after.status === "rubric_ready"
  ) {
    console.log(`📄 Responses uploaded for discussion ${docId} — starting analysis`);
    await runDiscussionAnalysis(docId, after, ref);
    return;
  }

  // Case 2: Retry rubric
  if (before.status !== "retry_rubric" && after.status === "retry_rubric") {
    console.log(`1- Retrying rubric for discussion ${docId}`);
    try {
      await ref.update({ status: "rubric_generating" });

      const instrSnap = await db().collection("instructorPreferences").limit(1).get();
      let instructorContext = "";
      if (!instrSnap.empty) {
        const instr = instrSnap.docs[0].data();
        instructorContext = `
## Instructor Profile
- Name: ${instr.name || "N/A"}
- Department: ${instr.dept || instr.department || "N/A"}
- Grading Notes: ${instr.notes || instr.gradingNotes || "N/A"}
`;
      }

      console.log("2- Generating discussion rubric");
      const rubric = await generateDiscussionRubric(after, instructorContext);
      console.log("3- Uploading discussion rubric");
      const fileName = `discussion-rubrics/week${after.week}_rubric_retry.json`;
      const rubricUrl = await uploadJsonToBytescale(rubric, fileName);
      console.log("4- Updating discussion rubric");   
      console.log("5- Updating discussion rubric generated at");
      await ref.update({
        rubric,
        rubricUrl,
      status: "rubric_ready",
      rubricGeneratedAt: FieldValue.serverTimestamp(),
      error: FieldValue.delete(),
    });
      console.log("6- Running discussion analysis");
      // If responses exist, kick off analysis
      if (after.responsesText) {
        const updatedDoc = await ref.get();
        await runDiscussionAnalysis(docId, updatedDoc.data(), ref);
      }
    } catch (error) {
      await ref.update({ status: "rubric_failed", error: error.message });
    }
    return;
  }

  // Case 3: Retry analysis
  if (before.status !== "retry_analysis" && after.status === "retry_analysis") {
    console.log(`🔄 Retrying analysis for discussion ${docId}`);
    await runDiscussionAnalysis(docId, after, ref);
    return;
  }
}

async function runDiscussionAnalysis(docId, discussion, ref) {
  // Guard
  if (discussion.status === "analyzing" || discussion.status === "analyzed") {
    console.log(`⏭️ Discussion ${docId} already "${discussion.status}" — skipping analysis`);
    return;
  }

  if (!discussion.rubric) {
    console.log(`⏳ No rubric for discussion ${docId} — cannot analyze yet`);
    return;
  }

  if (!discussion.responsesText) {
    console.log(`⏳ No responses for discussion ${docId} — cannot analyze yet`);
    return;
  }

  try {
    await ref.update({ status: "analyzing" });

    const insights = await analyzeDiscussionResponses(discussion);

    const fileName = `discussion-insights/week${discussion.week}_insights.json`;
    const insightsUrl = await uploadJsonToBytescale(insights, fileName);
    console.log(`☁️ Discussion insights uploaded: ${insightsUrl}`);

    await ref.update({
      insights,
      insightsUrl,
      status: "analyzed",
      analyzedAt: FieldValue.serverTimestamp(),
      error: FieldValue.delete(),
    });

    console.log(`✅ Discussion analysis complete for Week ${discussion.week}`);
  } catch (error) {
    console.error(`❌ Discussion analysis failed for ${docId}:`, error);
    await ref.update({
      status: "analysis_failed",
      error: error.message,
    });
  }
}

module.exports = {
  generateDiscussionRubric,
  analyzeDiscussionResponses,
  handleDiscussionCreated,
  handleDiscussionUpdated,
  runDiscussionAnalysis,
};
