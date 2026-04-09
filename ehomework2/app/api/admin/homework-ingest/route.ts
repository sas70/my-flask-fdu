import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import {
  formatUploadFromUrlError,
  uploadBinaryToBytescale,
  uploadFromUrlToBytescale,
} from "@/lib/bytescale-binary";
import { classifyUploadedFile, guessMimeFromFileName } from "@/lib/homework-file-classify";

export const maxDuration = 300;

const MAX_URLS = 20;
const MAX_FILES = 15;
const MAX_FILE_BYTES = 800 * 1024 * 1024; // 800 MiB per file (platform limits may be lower)

function sanitizeFileName(name: string): string {
  return (name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
}

function parseUrlList(raw: string | null): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_URLS);
}

function fileNameFromUrl(u: string, fallback: string): string {
  try {
    const path = new URL(u).pathname.split("/").pop();
    if (path && path.length > 0) return sanitizeFileName(path);
  } catch {
    /* ignore */
  }
  return fallback;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const studentId = String(formData.get("studentId") || "").trim();
    const weekRaw = formData.get("week");
    const week = Number(weekRaw);
    const studentNameOverride = String(formData.get("studentName") || "").trim();

    if (!studentId) {
      return NextResponse.json({ error: "studentId is required" }, { status: 400 });
    }
    if (!weekRaw || Number.isNaN(week) || week < 1) {
      return NextResponse.json({ error: "week must be a positive number" }, { status: 400 });
    }

    const db = getDb();
    const stRef = db.collection("students").doc(studentId);
    const stSnap = await stRef.get();
    if (!stSnap.exists) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }
    const st = stSnap.data()!;
    const rosterName = [st.firstName, st.lastName].filter(Boolean).join(" ").trim() || "Student";
    const studentName = studentNameOverride || rosterName;

    const videoUrlList = parseUrlList(formData.get("videoUrls") as string | null);
    const documentUrlList = parseUrlList(formData.get("documentUrls") as string | null);
    const fileEntries = formData.getAll("files").filter((x): x is File => x instanceof File && x.size > 0);

    if (fileEntries.length > MAX_FILES) {
      return NextResponse.json({ error: `At most ${MAX_FILES} files per request` }, { status: 400 });
    }
    if (
      videoUrlList.length === 0 &&
      documentUrlList.length === 0 &&
      fileEntries.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Add at least one file and/or a video URL and/or a document URL (PDF/text). All files are stored on ByteScale first.",
        },
        { status: 400 }
      );
    }

    const videos: { name: string; url: string }[] = [];
    const attachments: { name: string; url: string; mimeType: string }[] = [];
    const prefix = `homework/week${week}/${studentId}/${Date.now()}`;

    for (let i = 0; i < fileEntries.length; i++) {
      const file = fileEntries[i];
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds size limit (${MAX_FILE_BYTES} bytes)` },
          { status: 400 }
        );
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const rawName = file.name || `file_${i + 1}`;
      const name = sanitizeFileName(rawName);
      const ct = file.type || guessMimeFromFileName(rawName);
      const kind = classifyUploadedFile(ct, rawName);
      if (kind === "reject") {
        return NextResponse.json(
          {
            error: `Unsupported file type for "${rawName}". Use video (e.g. mp4), PDF, plain text, Python (.py), or Jupyter/Colab (.ipynb).`,
          },
          { status: 400 }
        );
      }
      const fileUrl = await uploadBinaryToBytescale(buf, `${prefix}_${name}`, ct || "application/octet-stream");
      if (kind === "video") {
        videos.push({ name, url: fileUrl });
      } else {
        attachments.push({ name, url: fileUrl, mimeType: ct || guessMimeFromFileName(rawName) });
      }
    }

    for (let i = 0; i < videoUrlList.length; i++) {
      const u = videoUrlList[i];
      try {
        const fileUrl = await uploadFromUrlToBytescale(u);
        videos.push({ name: fileNameFromUrl(u, `from_url_${i + 1}`), url: fileUrl });
      } catch (e) {
        return NextResponse.json({ error: formatUploadFromUrlError(u, e, "video") }, { status: 422 });
      }
    }

    for (let i = 0; i < documentUrlList.length; i++) {
      const u = documentUrlList[i];
      try {
        const fileUrl = await uploadFromUrlToBytescale(u);
        const nm = fileNameFromUrl(u, `doc_url_${i + 1}`);
        attachments.push({
          name: nm,
          url: fileUrl,
          mimeType: guessMimeFromFileName(nm),
        });
      } catch (e) {
        return NextResponse.json({ error: formatUploadFromUrlError(u, e, "document") }, { status: 422 });
      }
    }

    const ref = await db.collection("homeworkSubmissions").add({
      studentId,
      studentName,
      week,
      videos,
      attachments,
      urls: [],
      status: "pending",
      ingestSource: "admin_homework_ingest",
      ingestedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      submissionId: ref.id,
      videoCount: videos.length,
      attachmentCount: attachments.length,
    });
  } catch (error) {
    console.error("[homework-ingest POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ingest failed" },
      { status: 500 }
    );
  }
}
