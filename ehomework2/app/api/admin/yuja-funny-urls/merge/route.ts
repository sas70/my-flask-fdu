/* eslint-disable @typescript-eslint/no-require-imports -- @ehomework/gradeflow-shared is CommonJS */
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";
import {
  YUJA_MERGE_DEFAULT_MIN_RATIO,
  mergeYujaSegmentTranscripts,
  yujaDocIdForUrl,
} from "@/lib/yuja-funny-urls";

export const maxDuration = 120;

const { uploadTextToBytescale } = require("@ehomework/gradeflow-shared") as {
  uploadTextToBytescale: (text: string, fileName: string) => Promise<string>;
};

/**
 * Manually merge segment transcripts for a yuja_funny_urls doc.
 * Use this for recovery or to lower the coverage threshold temporarily.
 *
 * Body: { url, minTranscribedRatio? } OR { yujaFunnyUrlsDocId, minTranscribedRatio? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      url?: string;
      yujaFunnyUrlsDocId?: string;
      minTranscribedRatio?: number;
    };
    const referenceUrl = String(body.url || "").trim();
    const bodyDocId = String(body.yujaFunnyUrlsDocId || "").trim();
    const minRatio =
      typeof body.minTranscribedRatio === "number" &&
      body.minTranscribedRatio > 0 &&
      body.minTranscribedRatio <= 1
        ? body.minTranscribedRatio
        : YUJA_MERGE_DEFAULT_MIN_RATIO;

    if (!referenceUrl && !bodyDocId) {
      return NextResponse.json({ error: "url or yujaFunnyUrlsDocId is required" }, { status: 400 });
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
    const merged = await mergeYujaSegmentTranscripts(db, docId, uploadTextToBytescale, {
      minTranscribedRatio: minRatio,
    });

    return NextResponse.json({
      ok: true,
      yujaFunnyUrlsDocId: docId,
      combinedTranscriptionUrl: merged.combinedTranscriptionUrl,
      combinedLength: merged.combinedText.length,
      includedChunkIndices: merged.includedChunkIndices,
      omittedChunkIndices: merged.omittedChunkIndices,
      minTranscribedRatio: merged.minTranscribedRatio,
      totalChunks: merged.totalChunks,
    });
  } catch (e) {
    console.error("[yuja-funny-urls/merge]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Merge failed" },
      { status: 500 }
    );
  }
}
