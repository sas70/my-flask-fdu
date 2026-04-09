import { NextRequest, NextResponse } from "next/server";
import { createRequire } from "node:module";
import {
  FieldValue,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import { uploadTextToBytescale } from "@/lib/bytescale-upload";

const COLLECTION = "students_survey_collection";

/** Same parser as Cloud Function — for when Firestore triggers are not deployed or not firing. */
const requireShared = createRequire(import.meta.url);
const { handleSurveyCsvUploadCreated } = requireShared(
  "@ehomework/gradeflow-shared"
) as {
  handleSurveyCsvUploadCreated: (snap: DocumentSnapshot, docId: string) => Promise<void>;
};

/** Vercel / long CSV: raise limit where the platform allows (ignored locally). */
export const maxDuration = 300;

function mapUploadDoc(d: DocumentSnapshot) {
  const x = d.data();
  if (!x) {
    return {
      id: d.id,
      fileName: null,
      csvUrl: null,
      status: "unknown",
      rowCount: null,
      matchedToRosterCount: null,
      unmatchedRowCount: null,
      matchedStudentSummary: null,
      unmatchedRowSummary: null,
      summaryTruncated: false,
      error: null,
      uploadedAt: null,
      processedAt: null,
    };
  }
  return {
    id: d.id,
    fileName: x.fileName || null,
    csvUrl: x.csvUrl || null,
    status: x.status || "unknown",
    rowCount: x.rowCount ?? null,
    matchedToRosterCount: x.matchedToRosterCount ?? null,
    unmatchedRowCount: x.unmatchedRowCount ?? null,
    matchedStudentSummary: Array.isArray(x.matchedStudentSummary)
      ? x.matchedStudentSummary
      : null,
    unmatchedRowSummary: Array.isArray(x.unmatchedRowSummary) ? x.unmatchedRowSummary : null,
    summaryTruncated: x.summaryTruncated === true,
    error: x.error || null,
    uploadedAt: x.uploadedAt?.toDate?.()?.toISOString?.() ?? null,
    processedAt: x.processedAt?.toDate?.()?.toISOString?.() ?? null,
  };
}

function isMissingIndexError(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? (error as { code?: number | string }).code
      : undefined;
  if (code === 9 || code === "failed-precondition") return true;
  const msg = error instanceof Error ? error.message : String(error);
  return /requires an index/i.test(msg);
}

export async function GET() {
  try {
    const db = getDb();
    let docs: QueryDocumentSnapshot[];

    try {
      const snap = await db
        .collection(COLLECTION)
        .where("kind", "==", "csv_upload")
        .orderBy("uploadedAt", "desc")
        .limit(5)
        .get();
      docs = snap.docs;
    } catch (firstErr) {
      // No composite index yet (or still building): equality-only query + sort in memory
      if (!isMissingIndexError(firstErr)) throw firstErr;
      const snap = await db
        .collection(COLLECTION)
        .where("kind", "==", "csv_upload")
        .limit(50)
        .get();
      docs = snap.docs
        .slice()
        .sort((a, b) => {
          const ta = a.data().uploadedAt?.toMillis?.() ?? 0;
          const tb = b.data().uploadedAt?.toMillis?.() ?? 0;
          return tb - ta;
        })
        .slice(0, 5);
    }

    const uploads = docs.map((d) => mapUploadDoc(d));
    return NextResponse.json({ uploads });
  } catch (error) {
    console.error("[student-questionnaire GET]", error);
    return NextResponse.json({ error: "Failed to load questionnaire uploads" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
    }

    const name = file.name || "responses.csv";

    const text = await file.text();
    if (!text.trim()) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }
    const fileName = `student-questionnaires/${Date.now()}_${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const csvUrl = await uploadTextToBytescale(text, fileName);

    const db = getDb();
    const ref = await db.collection(COLLECTION).add({
      kind: "csv_upload",
      csvUrl,
      fileName: name,
      uploadedAt: FieldValue.serverTimestamp(),
      status: "pending",
    });

    console.info("[student-questionnaire POST] created upload doc", { id: ref.id, csvUrl });

    return NextResponse.json({
      ok: true,
      id: ref.id,
      csvUrl,
      fileName: name,
    });
  } catch (error) {
    console.error("[student-questionnaire POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}

/**
 * Run CSV parsing in the Next.js process (same logic as onStudentSurveyUploadCreated).
 * Use when the Firestore trigger never runs (e.g. functions not deployed to this project).
 */
export async function PATCH(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON body required" }, { status: 400 });
    }
    const uploadId =
      body && typeof body === "object" && "uploadId" in body
        ? String((body as { uploadId?: unknown }).uploadId || "").trim()
        : "";
    if (!uploadId) {
      return NextResponse.json({ error: "uploadId is required" }, { status: 400 });
    }

    const db = getDb();
    const ref = db.collection(COLLECTION).doc(uploadId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }

    const data = snap.data();
    if (data?.kind !== "csv_upload" || !data?.csvUrl) {
      return NextResponse.json(
        { error: "Not a questionnaire CSV upload document" },
        { status: 400 }
      );
    }

    const status = String(data.status || "");
    if (status === "complete") {
      return NextResponse.json(
        { error: "This upload already finished. Upload a new CSV to import again." },
        { status: 409 }
      );
    }
    if (status === "processing") {
      return NextResponse.json(
        {
          error:
            "Already processing. Wait for it to finish, or check Cloud Function / server logs.",
        },
        { status: 409 }
      );
    }

    console.info("[student-questionnaire PATCH] server-side parse start", { uploadId });
    await handleSurveyCsvUploadCreated(snap, uploadId);
    console.info("[student-questionnaire PATCH] server-side parse done", { uploadId });

    const after = await ref.get();
    return NextResponse.json({
      ok: true,
      upload: mapUploadDoc(after),
    });
  } catch (error) {
    console.error("[student-questionnaire PATCH]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Parse failed" },
      { status: 500 }
    );
  }
}
