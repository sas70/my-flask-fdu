/**
 * Bulk student introduction .txt upload: AI parses file, fuzzy-matches names, writes bio on students.
 */
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { buildStudentRoster, findBestFuzzyNameMatch } = require("./studentNameMatch");

const ANTHROPIC_API_KEY = () => process.env.ANTHROPIC_API_KEY;

const MAX_TEXT_CHARS = 120000;

function db() {
  return getFirestore();
}

function splitFullName(fullName) {
  const raw = String(fullName || "").trim().replace(/\s+/g, " ");
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return { first: parts[0], last: parts.slice(1).join(" ") };
  }
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: "", last: "" };
}

function normalizeExtractedEntry(raw) {
  let first = String(raw.firstName || "").trim();
  let last = String(raw.lastName || "").trim();
  const full = String(raw.fullName || "").trim();
  if ((!first || !last) && full) {
    const sp = splitFullName(full);
    if (!first) first = sp.first;
    if (!last) last = sp.last;
  }
  const introduction = String(raw.introduction || raw.bio || "").trim();
  return { first, last, introduction };
}

async function parseIntroductionsWithClaude(documentText) {
  const body = documentText.length > MAX_TEXT_CHARS
    ? documentText.substring(0, MAX_TEXT_CHARS)
    : documentText;

  const prompt = `You are parsing a plain-text document with self-introductions or short bios for multiple students in a college class.

The file may use varied layouts: names on their own line, "Name: ...", numbered sections, bullet lists, or blank-line-separated paragraphs.

## Task
Return ONLY valid JSON (no markdown code fences) with this exact shape:
{
  "students": [
    {
      "firstName": "string",
      "lastName": "string",
      "fullName": "",
      "introduction": "string"
    }
  ]
}

Rules:
- For each distinct student, set "introduction" to their bio/introduction text only (do not repeat the name as a heading inside introduction if avoidable).
- Use "firstName" and "lastName" when clear. If you only have one full name string, put it in "fullName" and leave firstName/lastName empty — they will be split automatically.
- Omit class-wide headers from the array; only real students.
- If you cannot separate one entry, skip it rather than inventing names.
- "introduction" must be non-empty for each array element you include.

## Document

---
${body}
---
`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16384,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("Claude returned no text");

  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`AI returned invalid JSON: ${e.message}`);
  }
  const list = Array.isArray(parsed?.students)
    ? parsed.students
    : Array.isArray(parsed)
      ? parsed
      : [];
  return list.map(normalizeExtractedEntry).filter((e) => e.introduction);
}

/**
 * Firestore onCreate: students_introduction/{id} with kind === "introduction_text_upload"
 */
async function handleStudentsIntroductionUploadCreated(snap, docId) {
  const data = snap.data();
  if (data.kind !== "introduction_text_upload" || !data.textUrl) {
    console.log(`⏭️ Introduction upload ${docId} — skip (wrong kind or no textUrl)`);
    return;
  }

  await snap.ref.update({ status: "processing", error: FieldValue.delete() });

  try {
    const res = await fetch(data.textUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch introduction file (${res.status})`);
    }
    const text = await res.text();
    if (!text.trim()) {
      throw new Error("Introduction file is empty");
    }

    const extracted = await parseIntroductionsWithClaude(text);
    if (extracted.length === 0) {
      throw new Error("AI extracted no student introductions from the file");
    }

    const { roster } = await buildStudentRoster();

    let batch = db().batch();
    let opCount = 0;
    const commitIfNeeded = async () => {
      if (opCount >= 450) {
        await batch.commit();
        batch = db().batch();
        opCount = 0;
      }
    };

    let matchedCount = 0;
    const unmatched = [];

    for (const entry of extracted) {
      const hit = findBestFuzzyNameMatch(entry.first, entry.last, roster);
      if (!hit) {
        unmatched.push(
          [entry.first, entry.last].filter(Boolean).join(" ").trim() || "(no name)"
        );
        continue;
      }
      matchedCount++;
      const stRef = db().collection("students").doc(hit.id);
      batch.set(
        stRef,
        {
          bio: entry.introduction,
          introductionSourceUploadId: docId,
          introductionMatchScore: hit.score,
          introductionParsedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      opCount++;
      await commitIfNeeded();
    }

    if (opCount > 0) {
      await batch.commit();
    }

    await snap.ref.update({
      status: "complete",
      parsedStudentCount: extracted.length,
      matchedCount,
      unmatchedCount: unmatched.length,
      unmatchedSample: unmatched.slice(0, 15),
      processedAt: FieldValue.serverTimestamp(),
      error: FieldValue.delete(),
    });

    console.log(
      `✅ Introductions processed ${docId}: ${matchedCount}/${extracted.length} matched`
    );
  } catch (err) {
    console.error(`❌ Introduction upload failed ${docId}:`, err);
    await snap.ref.update({
      status: "failed",
      error: err.message || String(err),
    });
  }
}

module.exports = {
  handleStudentsIntroductionUploadCreated,
  parseIntroductionsWithClaude,
};
