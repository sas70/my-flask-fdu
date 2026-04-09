/* eslint-disable @typescript-eslint/no-require-imports -- @ehomework/gradeflow-shared is CommonJS */
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";
import { YUJA_MERGE_DEFAULT_MIN_RATIO, mergeYujaSegmentTranscripts } from "@/lib/yuja-funny-urls";

export const maxDuration = 120;

const { uploadTextToBytescale } = require("@ehomework/gradeflow-shared") as {
  uploadTextToBytescale: (text: string, fileName: string) => Promise<string>;
};

/**
 * Manually merge segment transcript .txt files for a yuja_funny_urls doc (ordered by chunk indices).
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      yujaFunnyUrlsDocId?: string;
      chunkIndices?: number[];
      minTranscribedRatio?: number;
    };
    const docId = String(body.yujaFunnyUrlsDocId || "").trim();
    const indices = Array.isArray(body.chunkIndices) ? body.chunkIndices : null;
    const minRatio =
      typeof body.minTranscribedRatio === "number" && body.minTranscribedRatio > 0 && body.minTranscribedRatio <= 1
        ? body.minTranscribedRatio
        : YUJA_MERGE_DEFAULT_MIN_RATIO;

    if (!docId) {
      return NextResponse.json({ error: "yujaFunnyUrlsDocId is required" }, { status: 400 });
    }
    if (!indices || indices.length === 0) {
      return NextResponse.json({ error: "chunkIndices must be a non-empty array" }, { status: 400 });
    }

    const ordered = [...indices].sort((a, b) => a - b);
    const db = getDb();
    const merged = await mergeYujaSegmentTranscripts(db, docId, ordered, uploadTextToBytescale, {
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
    });
  } catch (e) {
    console.error("[yuja-funny-urls/merge]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Merge failed" },
      { status: 500 }
    );
  }
}
