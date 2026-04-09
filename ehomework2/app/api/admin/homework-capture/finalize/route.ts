/* eslint-disable @typescript-eslint/no-require-imports -- @ehomework/gradeflow-shared is CommonJS */
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import {
  loadSortedChunks,
  sessionRef,
} from "@/lib/homework-capture-server";
import {
  YUJA_MERGE_DEFAULT_MIN_RATIO,
  ensureSessionYujaFunnyDoc,
  mergeYujaSegmentTranscripts,
} from "@/lib/yuja-funny-urls";

export const maxDuration = 120;

const { uploadTextToBytescale } = require("@ehomework/gradeflow-shared") as {
  uploadTextToBytescale: (text: string, fileName: string) => Promise<string>;
};

/**
 * Creates homeworkSubmissions from captured chunks (ordered). Triggers the same Cloud Function pipeline as file ingest.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { sessionId?: string };
    const sessionId = String(body.sessionId || "").trim();
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const db = getDb();
    const sessRef = sessionRef(db, sessionId);
    const sess = await sessRef.get();
    if (!sess.exists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const data = sess.data()!;
    if (data.status !== "open") {
      return NextResponse.json(
        { error: `Session already ${data.status}` },
        { status: 409 }
      );
    }

    const chunks = await loadSortedChunks(db, sessionId);
    if (chunks.length === 0) {
      return NextResponse.json({ error: "No chunks uploaded. Record and upload at least one segment first." }, { status: 400 });
    }

    const studentId = data.studentId as string;
    const studentName = data.studentName as string;
    const week = data.week as number;
    const referencePlaybackUrl = data.referencePlaybackUrl as string | null | undefined;

    let yujaFunnyUrlsDocId: string | null =
      typeof data.yujaFunnyUrlsDocId === "string" && data.yujaFunnyUrlsDocId.trim()
        ? data.yujaFunnyUrlsDocId.trim()
        : null;
    if (!yujaFunnyUrlsDocId && referencePlaybackUrl) {
      yujaFunnyUrlsDocId = await ensureSessionYujaFunnyDoc(db, sessionId);
    }

    let premergedWalkthroughTranscriptionUrl: string | null = null;
    if (yujaFunnyUrlsDocId) {
      const orderedIndices = [...chunks.map((c) => c.chunkIndex)].sort((a, b) => a - b);
      try {
        const merged = await mergeYujaSegmentTranscripts(
          db,
          yujaFunnyUrlsDocId,
          orderedIndices,
          uploadTextToBytescale,
          { minTranscribedRatio: YUJA_MERGE_DEFAULT_MIN_RATIO }
        );
        premergedWalkthroughTranscriptionUrl = merged.combinedTranscriptionUrl;
      } catch (mergeErr) {
        const msg = mergeErr instanceof Error ? mergeErr.message : String(mergeErr);
        return NextResponse.json(
          {
            error: `Cannot finalize yet: ${msg} Ensure each segment finished transcribing (wait after recording) or fix failed segments.`,
          },
          { status: 409 }
        );
      }
    }

    const videos = chunks.map((c, i) => ({
      name: c.name || `capture_part_${i + 1}.webm`,
      url: c.url,
      mimeType: c.mimeType || "video/webm",
    }));

    const subRef = await db.collection("homeworkSubmissions").add({
      studentId,
      studentName,
      week,
      videos,
      urls: [],
      attachments: [],
      referencePlaybackUrl: referencePlaybackUrl || null,
      captureSessionId: sessionId,
      ingestSource: "admin_browser_capture",
      yujaFunnyUrlsDocId: yujaFunnyUrlsDocId || null,
      premergedWalkthroughTranscriptionUrl: premergedWalkthroughTranscriptionUrl || null,
      status: "pending",
      ingestedAt: FieldValue.serverTimestamp(),
    });

    await sessRef.update({
      status: "finalized",
      submissionId: subRef.id,
      finalizedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      submissionId: subRef.id,
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
