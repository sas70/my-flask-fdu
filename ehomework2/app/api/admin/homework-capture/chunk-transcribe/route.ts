/* eslint-disable @typescript-eslint/no-require-imports -- @ehomework/gradeflow-shared is CommonJS */
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";
import {
  loadYujaDocById,
  writeYujaSegmentTranscript,
  writeYujaSegmentTranscriptFailed,
  yujaDocIdForUrl,
} from "@/lib/yuja-funny-urls";

export const maxDuration = 300;

const {
  transcribeWithGemini,
  uploadTextToBytescale,
} = require("@ehomework/gradeflow-shared") as {
  transcribeWithGemini: (url: string, mime: string) => Promise<string>;
  uploadTextToBytescale: (text: string, fileName: string) => Promise<string>;
};

function truncateUrl(u: string, max = 96): string {
  const s = String(u || "");
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

/**
 * Transcribe one recorded chunk (Gemini) and write the .txt URL to the yuja doc.
 *
 * Body: { url, chunkIndex } OR { yujaFunnyUrlsDocId, chunkIndex }
 * The chunk must already have a `chunkUrl` stored (i.e. POST /chunk ran first).
 * This endpoint is safe to call again on a failed or completed segment — it re-runs Gemini.
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.GOOGLE_API_KEY) {
      return NextResponse.json(
        { error: "GOOGLE_API_KEY is not configured (required for segment transcription)." },
        { status: 503 }
      );
    }

    const body = (await request.json()) as {
      url?: string;
      yujaFunnyUrlsDocId?: string;
      chunkIndex?: number;
    };
    const referenceUrl = String(body.url || "").trim();
    const bodyDocId = String(body.yujaFunnyUrlsDocId || "").trim();
    const chunkIndex = Number(body.chunkIndex);

    if (!referenceUrl && !bodyDocId) {
      return NextResponse.json({ error: "url or yujaFunnyUrlsDocId is required" }, { status: 400 });
    }
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
      return NextResponse.json({ error: "chunkIndex must be a non-negative integer" }, { status: 400 });
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

    const seg = data.segments?.[String(chunkIndex)];
    if (!seg?.chunkUrl) {
      return NextResponse.json(
        { error: `Chunk ${chunkIndex} has no uploaded chunkUrl yet.` },
        { status: 400 }
      );
    }

    const mime = seg.chunkMimeType || "video/webm";

    console.log(
      `[homework-capture/chunk-transcribe] start chunkIndex=${chunkIndex} doc=${docId.slice(0, 12)}… mime=${mime} chunkUrl=${truncateUrl(seg.chunkUrl)}`
    );

    let text: string;
    try {
      text = await transcribeWithGemini(seg.chunkUrl, mime);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `[homework-capture/chunk-transcribe] GEMINI_FAIL chunkIndex=${chunkIndex} doc=${docId.slice(0, 12)}… ${msg}`
      );
      await writeYujaSegmentTranscriptFailed(db, docId, chunkIndex, msg);
      return NextResponse.json(
        { error: msg, chunkIndex, transcriptionStatus: "failed" },
        { status: 502 }
      );
    }

    const fileName = `yuja_funny_urls/${docId}/segment_${String(chunkIndex).padStart(4, "0")}.txt`;
    const transcriptUrl = await uploadTextToBytescale(text, fileName);
    await writeYujaSegmentTranscript(db, docId, chunkIndex, transcriptUrl);

    console.log(
      `[homework-capture/chunk-transcribe] ok chunkIndex=${chunkIndex} doc=${docId.slice(0, 12)}… transcriptChars=${text.length}`
    );

    return NextResponse.json({
      ok: true,
      chunkIndex,
      transcriptUrl,
      yujaFunnyUrlsDocId: docId,
    });
  } catch (e) {
    console.error("[homework-capture/chunk-transcribe]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Segment transcription failed" },
      { status: 500 }
    );
  }
}
