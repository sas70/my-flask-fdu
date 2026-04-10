/* eslint-disable @typescript-eslint/no-require-imports -- @ehomework/gradeflow-shared is CommonJS */
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import {
  YUJA_MERGE_DEFAULT_MIN_RATIO,
  loadYujaDocById,
  mergeYujaSegmentTranscripts,
  yujaDocIdForUrl,
  type YujaSegmentRecord,
} from "@/lib/yuja-funny-urls";

export const maxDuration = 120;

const { uploadTextToBytescale } = require("@ehomework/gradeflow-shared") as {
  uploadTextToBytescale: (text: string, fileName: string) => Promise<string>;
};

/**
 * Finalize a recording by:
 *   1. Merging the per-segment transcripts into one combined .txt (uploaded to ByteScale)
 *   2. Creating a homeworkSubmissions doc for (studentId, week) that points at the merged URL
 *
 * The yuja doc is the source of truth for the transcription. Student/week are provided
 * by the caller at finalize time — they are NOT stored on the yuja doc.
 *
 * Body: { url, studentId, week } OR { yujaFunnyUrlsDocId, studentId, week }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      url?: string;
      yujaFunnyUrlsDocId?: string;
      studentId?: string;
      week?: number;
      minTranscribedRatio?: number;
    };
    const referenceUrl = String(body.url || "").trim();
    const bodyDocId = String(body.yujaFunnyUrlsDocId || "").trim();
    const studentId = String(body.studentId || "").trim();
    const week = Number(body.week);
    const minRatio =
      typeof body.minTranscribedRatio === "number" &&
      body.minTranscribedRatio > 0 &&
      body.minTranscribedRatio <= 1
        ? body.minTranscribedRatio
        : YUJA_MERGE_DEFAULT_MIN_RATIO;

    if (!referenceUrl && !bodyDocId) {
      return NextResponse.json({ error: "url or yujaFunnyUrlsDocId is required" }, { status: 400 });
    }
    if (!studentId) {
      return NextResponse.json({ error: "studentId is required" }, { status: 400 });
    }
    if (!Number.isInteger(week) || week < 1) {
      return NextResponse.json({ error: "week must be a positive integer" }, { status: 400 });
    }

    let docId = bodyDocId;
    if (!docId) {
      try {
        docId = yujaDocIdForUrl(referenceUrl).docId;
      } catch {
        return NextResponse.json({ error: "Invalid reference URL" }, { status: 400 });
      }
    }

    const db = getDb();
    const data = await loadYujaDocById(db, docId);
    if (!data) {
      return NextResponse.json({ error: "yuja_funny_urls doc not found for this URL" }, { status: 404 });
    }

    // Look up the student (we need the display name for the submission doc).
    const stSnap = await db.collection("students").doc(studentId).get();
    if (!stSnap.exists) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }
    const stData = stSnap.data() as { firstName?: string; lastName?: string };
    const studentName =
      [stData.firstName, stData.lastName].filter(Boolean).join(" ").trim() || "Student";

    // Merge (or reuse existing merged URL if fresh). `mergeYujaSegmentTranscripts` always
    // re-runs the merge so it picks up any newly-retried segments since the last call.
    let combinedTranscriptionUrl: string;
    try {
      const merged = await mergeYujaSegmentTranscripts(db, docId, uploadTextToBytescale, {
        minTranscribedRatio: minRatio,
      });
      combinedTranscriptionUrl = merged.combinedTranscriptionUrl;
    } catch (mergeErr) {
      const msg = mergeErr instanceof Error ? mergeErr.message : String(mergeErr);
      return NextResponse.json(
        {
          error: `Cannot finalize yet: ${msg} Wait for in-flight transcriptions or use "Retry failed".`,
        },
        { status: 409 }
      );
    }

    // Build the video list from the segments (in chunk-index order).
    const segments = (data.segments || {}) as Record<string, YujaSegmentRecord>;
    const orderedIndices = Object.keys(segments)
      .map((k) => Number(k))
      .filter((n) => Number.isInteger(n) && n >= 0)
      .sort((a, b) => a - b);

    const videos = orderedIndices
      .map((idx) => segments[String(idx)])
      .filter((s): s is YujaSegmentRecord => !!s?.chunkUrl)
      .map((s, i) => ({
        name: s.chunkName || `capture_part_${i + 1}.webm`,
        url: s.chunkUrl!,
        mimeType: s.chunkMimeType || "video/webm",
      }));

    const subRef = await db.collection("homeworkSubmissions").add({
      studentId,
      studentName,
      week,
      videos,
      urls: [],
      attachments: [],
      referencePlaybackUrl: data.referencePlaybackUrl,
      yujaFunnyUrlsDocId: docId,
      premergedWalkthroughTranscriptionUrl: combinedTranscriptionUrl,
      ingestSource: "admin_browser_capture",
      status: "pending",
      ingestedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      submissionId: subRef.id,
      yujaFunnyUrlsDocId: docId,
      combinedTranscriptionUrl,
      videoCount: videos.length,
    });
  } catch (e) {
    console.error("[homework-capture/finalize]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Finalize failed" },
      { status: 500 }
    );
  }
}
