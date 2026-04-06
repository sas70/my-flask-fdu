import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";

const COLLECTION = "students";

/**
 * Bulk import students from CSV/TSV.
 * Expects columns: Last Name, First Name, Username (tab or comma separated).
 * Also supports: lastName, firstName, username, email, bio headers.
 * Deduplicates by username.
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    let students: Array<{
      firstName: string;
      lastName: string;
      username: string;
      email?: string;
      bio?: string;
    }>;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File;

      if (!file || file.size === 0) {
        return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
      }

      const text = await file.text();
      students = parseCSV(text);
    } else {
      const body = await request.json();
      students = body.students;
    }

    if (!students || students.length === 0) {
      return NextResponse.json({ error: "No students to import" }, { status: 400 });
    }

    const db = getDb();
    const batch = db.batch();
    const results: Array<{ firstName: string; lastName: string; username: string; status: string }> = [];

    // Check for existing students by username to avoid duplicates
    const existingSnap = await db.collection(COLLECTION).get();
    const existingUsernames = new Set(
      existingSnap.docs
        .map((d) => d.data().username?.toLowerCase())
        .filter(Boolean)
    );

    let created = 0;
    let skipped = 0;

    for (const s of students) {
      if (!s.firstName || !s.lastName) {
        results.push({
          firstName: s.firstName || "?",
          lastName: s.lastName || "?",
          username: s.username || "?",
          status: "skipped — missing name",
        });
        skipped++;
        continue;
      }

      if (s.username && existingUsernames.has(s.username.toLowerCase())) {
        results.push({
          firstName: s.firstName,
          lastName: s.lastName,
          username: s.username,
          status: "skipped — username already exists",
        });
        skipped++;
        continue;
      }

      const ref = db.collection(COLLECTION).doc();
      batch.set(ref, {
        firstName: s.firstName.trim(),
        lastName: s.lastName.trim(),
        username: (s.username || "").trim(),
        email: (s.email || "").trim(),
        bio: (s.bio || "").trim(),
        documents: [],
        instructorComments: "",
      });

      if (s.username) existingUsernames.add(s.username.toLowerCase());
      results.push({
        firstName: s.firstName,
        lastName: s.lastName,
        username: s.username,
        status: "created",
      });
      created++;
    }

    await batch.commit();

    return NextResponse.json({
      ok: true,
      created,
      skipped,
      total: students.length,
      results,
    });
  } catch (error) {
    console.error("Bulk import error:", error);
    return NextResponse.json({ error: "Failed to import students" }, { status: 500 });
  }
}

function parseCSV(
  text: string
): Array<{ firstName: string; lastName: string; username: string; email?: string; bio?: string }> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  // Detect delimiter: tab or comma
  const firstLine = lines[0];
  const delimiter = firstLine.includes("\t") ? "\t" : ",";

  const header = firstLine.split(delimiter).map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));

  // Map known header variations
  const findIdx = (names: string[]) =>
    header.findIndex((h) => names.includes(h));

  const lastNameIdx = findIdx(["last name", "lastname", "last_name", "last"]);
  const firstNameIdx = findIdx(["first name", "firstname", "first_name", "first"]);
  const usernameIdx = findIdx(["username", "user name", "user_name", "user", "login"]);
  const emailIdx = findIdx(["email", "e-mail", "email address"]);
  const bioIdx = findIdx(["bio", "biography"]);

  // If no header match at all, assume positional: Last Name, First Name, Username
  const usePosMode = lastNameIdx === -1 && firstNameIdx === -1;

  return lines.slice(1).map((line) => {
    const cols = delimiter === "\t"
      ? line.split("\t").map((c) => c.trim())
      : parseCSVLine(line);

    if (usePosMode) {
      return {
        lastName: cols[0] || "",
        firstName: cols[1] || "",
        username: cols[2] || "",
        email: cols[3] || "",
        bio: cols[4] || "",
      };
    }

    return {
      lastName: lastNameIdx >= 0 ? cols[lastNameIdx] || "" : "",
      firstName: firstNameIdx >= 0 ? cols[firstNameIdx] || "" : "",
      username: usernameIdx >= 0 ? cols[usernameIdx] || "" : "",
      email: emailIdx >= 0 ? cols[emailIdx] || "" : "",
      bio: bioIdx >= 0 ? cols[bioIdx] || "" : "",
    };
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
