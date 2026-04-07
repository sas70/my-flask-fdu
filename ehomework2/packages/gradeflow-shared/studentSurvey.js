/**
 * Student questionnaire CSV processing + instructor-facing profile summaries.
 */
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { normalizeEmail, buildStudentRoster, findBestFuzzyNameMatch } = require("./studentNameMatch");

const ANTHROPIC_API_KEY = () => process.env.ANTHROPIC_API_KEY;

function db() {
  return getFirestore();
}

/** Strip UTF-8 BOM */
function stripBom(text) {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
  return text;
}

/**
 * Minimal RFC4180-style CSV parse (quoted fields, commas inside quotes).
 * @returns {string[][]}
 */
function parseCsv(text) {
  const s = stripBom(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [];
  let cur = "";
  let i = 0;
  let inQuotes = false;
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"' && s[i + 1] === '"') {
        cur += '"';
        i += 2;
        continue;
      }
      if (c === '"') {
        inQuotes = false;
        i++;
        continue;
      }
      cur += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(cur);
      cur = "";
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  row.push(cur);
  if (row.some((cell) => String(cell).length > 0)) {
    rows.push(row);
  }
  return rows;
}

function rowsToObjects(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => String(h).trim());
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = cells[c] != null ? String(cells[c]).trim() : "";
    }
    out.push(obj);
  }
  return out;
}

function findEmailInRow(rowObj) {
  const keys = Object.keys(rowObj);
  const emailKey = keys.find((k) => /email/i.test(k));
  if (!emailKey) return "";
  return String(rowObj[emailKey] || "").trim();
}

/** Pull first/last from typical Google Form column headers, or split a full-name column. */
function extractNamePartsFromRow(rowObj) {
  const keys = Object.keys(rowObj);
  let first = "";
  let last = "";

  const firstKey =
    keys.find((k) => /^(first\s*name|given\s*name|fname)$/i.test(k.trim())) ||
    keys.find((k) => /\bfirst\s*name\b/i.test(k));
  const lastKey =
    keys.find((k) => /^(last\s*name|surname|family\s*name)$/i.test(k.trim())) ||
    keys.find((k) => /\blast\s*name\b/i.test(k)) ||
    keys.find((k) => /\bsurname\b/i.test(k) && !/first|email/i.test(k));

  if (firstKey) first = String(rowObj[firstKey] || "").trim();
  if (lastKey) last = String(rowObj[lastKey] || "").trim();

  if (!first && !last) {
    const fullKey = keys.find(
      (k) =>
        /^full\s*name$/i.test(k.trim()) ||
        (/^name$/i.test(k.trim()) && !/user|user\s*name|email|first|last/i.test(k))
    );
    if (fullKey) {
      const raw = String(rowObj[fullKey] || "").trim().replace(/\s+/g, " ");
      const parts = raw.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        first = parts[0];
        last = parts.slice(1).join(" ");
      } else if (parts.length === 1) {
        first = parts[0];
      }
    }
  }

  return { first, last };
}

/**
 * Firestore onCreate: students_survey_collection/{id} with kind === "csv_upload"
 */
async function handleSurveyCsvUploadCreated(snap, docId) {
  const data = snap.data();
  if (data.kind !== "csv_upload" || !data.csvUrl) {
    console.log(`⏭️ Survey upload ${docId} — not a csv_upload or missing csvUrl`);
    return;
  }

  await snap.ref.update({ status: "processing", error: FieldValue.delete() });

  try {
    const res = await fetch(data.csvUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch CSV (${res.status})`);
    }
    const text = await res.text();
    const rows = parseCsv(text);
    let objects = rowsToObjects(rows);
    objects = objects.filter((row) =>
      Object.values(row).some((v) => String(v || "").trim().length > 0)
    );

    if (objects.length === 0) {
      throw new Error("CSV has no data rows (need header + at least one row)");
    }

    const { emailMap, roster } = await buildStudentRoster();

    let batch = db().batch();
    let opCount = 0;
    const commitIfNeeded = async () => {
      if (opCount >= 450) {
        await batch.commit();
        batch = db().batch();
        opCount = 0;
      }
    };

    for (let idx = 0; idx < objects.length; idx++) {
      const responses = objects[idx];
      const emailRaw = findEmailInRow(responses);
      const emailNorm = normalizeEmail(emailRaw);
      const { first: csvFirst, last: csvLast } = extractNamePartsFromRow(responses);

      let matchedStudentId = emailNorm ? emailMap.get(emailNorm) || null : null;
      let matchedBy = matchedStudentId ? "email" : null;
      let nameMatchScore = null;

      if (!matchedStudentId) {
        const nameHit = findBestFuzzyNameMatch(csvFirst, csvLast, roster);
        if (nameHit) {
          matchedStudentId = nameHit.id;
          matchedBy = "name_fuzzy";
          nameMatchScore = nameHit.score;
        }
      }

      const rowRef = db().collection("students_survey_collection").doc();
      batch.set(rowRef, {
        kind: "survey_response",
        uploadId: docId,
        rowIndex: idx,
        responses,
        respondentEmail: emailRaw || null,
        respondentEmailNormalized: emailNorm || null,
        respondentFirstName: csvFirst || null,
        respondentLastName: csvLast || null,
        matchedStudentId: matchedStudentId || null,
        matchedBy: matchedBy || null,
        nameMatchScore: nameMatchScore != null ? nameMatchScore : null,
        createdAt: FieldValue.serverTimestamp(),
      });
      opCount++;
      await commitIfNeeded();

      if (matchedStudentId) {
        const stRef = db().collection("students").doc(matchedStudentId);
        const mergeFields = {
          surveyResponses: responses,
          surveyResponseRowId: rowRef.id,
          surveyUploadId: docId,
          surveyReady: true,
          surveyMatchedBy: matchedBy,
        };
        if (matchedBy === "email" && emailNorm) {
          mergeFields.surveyMatchedEmail = emailNorm;
          mergeFields.surveyMatchedNameLabel = FieldValue.delete();
          mergeFields.surveyNameMatchScore = FieldValue.delete();
        } else if (matchedBy === "name_fuzzy") {
          mergeFields.surveyMatchedEmail = FieldValue.delete();
          mergeFields.surveyMatchedNameLabel =
            [csvFirst, csvLast].filter(Boolean).join(" ").trim() || null;
          mergeFields.surveyNameMatchScore = nameMatchScore;
        }
        batch.set(stRef, mergeFields, { merge: true });
        opCount++;
        await commitIfNeeded();
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }

    await snap.ref.update({
      status: "complete",
      rowCount: objects.length,
      processedAt: FieldValue.serverTimestamp(),
      error: FieldValue.delete(),
    });

    console.log(`✅ Survey CSV processed: ${docId}, ${objects.length} rows`);
  } catch (err) {
    console.error(`❌ Survey CSV processing failed ${docId}:`, err);
    await snap.ref.update({
      status: "failed",
      error: err.message || String(err),
    });
  }
}

function profileInputsEqual(a, b) {
  const bioA = (a.bio || "").trim();
  const bioB = (b.bio || "").trim();
  if (bioA !== bioB) return false;
  const sA = JSON.stringify(a.surveyResponses || {});
  const sB = JSON.stringify(b.surveyResponses || {});
  return sA === sB;
}

/**
 * Returns true if the only meaningful change is instructor summary fields (avoid loop).
 */
function onlySummaryMetadataChanged(before, after) {
  if (!before) return false;
  if (profileInputsEqual(before, after)) {
    const b = before.instructorProfileSummary;
    const a = after.instructorProfileSummary;
    const eb = before.instructorProfileSummaryError;
    const ea = after.instructorProfileSummaryError;
    if (b !== a || eb !== ea) return true;
  }
  return false;
}

async function buildProfileSummaryPrompt(student) {
  const bio = (student.bio || "").trim();
  const survey = student.surveyResponses || {};
  const surveyLines = Object.entries(survey)
    .map(([q, v]) => `- ${q}: ${v}`)
    .join("\n");

  const bioBlock = bio ? bio : "NA (no bio provided)";
  const surveyBlock =
    surveyLines.trim() ? surveyLines : "NA (no questionnaire responses matched)";

  return `You are helping a college instructor understand a student holistically.

## Student bio (free text from roster / instructor notes)
${bioBlock}

## Questionnaire responses (Google Form — each line is one question and answer)
${surveyBlock}

## Task
Write a concise, actionable **Instructor briefing** (plain text, no JSON) that covers:
- Learning preferences, background, and expectations (as inferable)
- Learning style hints and what tends to work for this student
- Strengths and any watch-outs
- Concrete notes for the instructor (how to support this student in discussions and assignments)

If information is missing for an area, say so briefly rather than inventing facts.
Keep the tone professional and supportive. Limit to about 400–600 words unless the data is very thin.`;
}

async function runProfileSummaryModel(prompt) {
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
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("Claude returned no summary text");
  return text.trim();
}

/**
 * Regenerate instructor profile summary when bio or survey inputs warrant it.
 */
async function maybeGenerateStudentProfileSummary(studentId, student, ref) {
  const bio = (student.bio || "").trim();
  const survey = student.surveyResponses || {};
  const hasSurvey = Object.keys(survey).some((k) => String(survey[k] || "").trim());

  if (!bio && !hasSurvey) {
    await ref.set(
      {
        instructorProfileSummary: FieldValue.delete(),
        instructorProfileSummaryUpdatedAt: FieldValue.delete(),
        instructorProfileSummaryError: FieldValue.delete(),
      },
      { merge: true }
    );
    return;
  }

  try {
    const prompt = await buildProfileSummaryPrompt(student);
    const summary = await runProfileSummaryModel(prompt);
    await ref.set(
      {
        instructorProfileSummary: summary,
        instructorProfileSummaryUpdatedAt: FieldValue.serverTimestamp(),
        instructorProfileSummaryError: FieldValue.delete(),
      },
      { merge: true }
    );
    console.log(`✅ Instructor profile summary for student ${studentId}`);
  } catch (err) {
    console.error(`❌ Profile summary failed for ${studentId}:`, err);
    await ref.set(
      {
        instructorProfileSummaryError: err.message || String(err),
        instructorProfileSummaryUpdatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
}

async function handleStudentProfileUpdated(before, after, studentId, ref) {
  if (onlySummaryMetadataChanged(before, after)) {
    return;
  }
  if (profileInputsEqual(before || {}, after || {})) {
    return;
  }
  await maybeGenerateStudentProfileSummary(studentId, after, ref);
}

async function handleStudentProfileCreated(snap, studentId) {
  const data = snap.data();
  await maybeGenerateStudentProfileSummary(studentId, data, snap.ref);
}

module.exports = {
  parseCsv,
  handleSurveyCsvUploadCreated,
  handleStudentProfileUpdated,
  handleStudentProfileCreated,
  maybeGenerateStudentProfileSummary,
};
