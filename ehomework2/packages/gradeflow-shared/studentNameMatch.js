/**
 * Shared roster loading + fuzzy first/last name matching for students.
 */
const { getFirestore } = require("firebase-admin/firestore");

function db() {
  return getFirestore();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/** Lowercase, trim, collapse spaces, strip most punctuation for comparison. */
function normalizeName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s'-]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function nameSimilarity(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const d = levenshteinDistance(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return maxLen === 0 ? 1 : 1 - d / maxLen;
}

function scoreNameAgainstStudent(csvFirst, csvLast, student) {
  const cf = normalizeName(csvFirst);
  const cl = normalizeName(csvLast);
  const sf = normalizeName(student.firstName || "");
  const sl = normalizeName(student.lastName || "");

  if (!cf && !cl) return 0;
  if (!sf && !sl) return 0;

  let sum = 0;
  let parts = 0;
  if (cf && sf) {
    sum += nameSimilarity(cf, sf);
    parts++;
  }
  if (cl && sl) {
    sum += nameSimilarity(cl, sl);
    parts++;
  }
  if (parts === 0) return 0;
  return sum / parts;
}

const NAME_FUZZY_MIN_SCORE = 0.78;
const NAME_AMBIGUITY_GAP = 0.045;

/**
 * @param {Array<{ id: string, firstName: string, lastName: string }>} roster
 * @returns {{ id: string, score: number } | null}
 */
function findBestFuzzyNameMatch(csvFirst, csvLast, roster) {
  const cf = (csvFirst || "").trim();
  const cl = (csvLast || "").trim();
  if (!cf && !cl) return null;

  const scored = roster
    .map((s) => ({
      id: s.id,
      score: scoreNameAgainstStudent(cf, cl, s),
    }))
    .filter((x) => x.score >= NAME_FUZZY_MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const top = scored[0];
  const second = scored[1];
  if (second && top.score - second.score < NAME_AMBIGUITY_GAP) {
    return null;
  }
  return { id: top.id, score: top.score };
}

async function buildStudentRoster() {
  const emailMap = new Map();
  const roster = [];
  const snap = await db().collection("students").get();
  for (const d of snap.docs) {
    const data = d.data();
    const e = normalizeEmail(data.email || "");
    if (e) emailMap.set(e, d.id);
    roster.push({
      id: d.id,
      firstName: data.firstName || "",
      lastName: data.lastName || "",
    });
  }
  return { emailMap, roster };
}

module.exports = {
  normalizeEmail,
  normalizeName,
  findBestFuzzyNameMatch,
  buildStudentRoster,
};
