import { NextRequest, NextResponse } from "next/server";
import { FieldValue, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import { uploadTextToBytescale } from "@/lib/bytescale-upload";

const COLLECTION = "students_introduction";

function mapUploadDoc(d: QueryDocumentSnapshot) {
  const x = d.data();
  return {
    id: d.id,
    fileName: x.fileName || null,
    textUrl: x.textUrl || null,
    status: x.status || "unknown",
    parsedStudentCount: x.parsedStudentCount ?? null,
    matchedCount: x.matchedCount ?? null,
    unmatchedCount: x.unmatchedCount ?? null,
    unmatchedSample: (x.unmatchedSample as string[] | undefined) ?? null,
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
        .where("kind", "==", "introduction_text_upload")
        .orderBy("uploadedAt", "desc")
        .limit(5)
        .get();
      docs = snap.docs;
    } catch (firstErr) {
      if (!isMissingIndexError(firstErr)) throw firstErr;
      console.warn(
        "[students-introduction GET] composite index missing; using in-memory sort fallback"
      );
      const snap = await db
        .collection(COLLECTION)
        .where("kind", "==", "introduction_text_upload")
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
    console.error("[students-introduction GET]", error);
    return NextResponse.json({ error: "Failed to load uploads" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "Text file is required" }, { status: 400 });
    }

    const name = file.name || "introductions.txt";
    const text = await file.text();
    if (!text.trim()) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    const fileName = `student-introductions/${Date.now()}_${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const textUrl = await uploadTextToBytescale(text, fileName);

    const db = getDb();
    const ref = await db.collection(COLLECTION).add({
      kind: "introduction_text_upload",
      textUrl,
      fileName: name,
      uploadedAt: FieldValue.serverTimestamp(),
      status: "pending",
    });

    console.info("[students-introduction POST] created doc", { id: ref.id, textUrl });

    return NextResponse.json({
      ok: true,
      id: ref.id,
      textUrl,
      fileName: name,
    });
  } catch (error) {
    console.error("[students-introduction POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
