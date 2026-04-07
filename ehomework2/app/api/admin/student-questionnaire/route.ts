import { NextRequest, NextResponse } from "next/server";
import { FieldValue, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import { uploadTextToBytescale } from "@/lib/bytescale-upload";

const COLLECTION = "students_survey_collection";

function mapUploadDoc(d: QueryDocumentSnapshot) {
  const x = d.data();
  return {
    id: d.id,
    fileName: x.fileName || null,
    csvUrl: x.csvUrl || null,
    status: x.status || "unknown",
    rowCount: x.rowCount ?? null,
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
      console.warn(
        "[student-questionnaire GET] composite index missing; using in-memory sort fallback"
      );
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
