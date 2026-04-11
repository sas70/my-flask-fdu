import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";
import { setYujaDocSourceDuration, yujaDocIdForUrl } from "@/lib/yuja-funny-urls";

/**
 * POST { url, sourceDurationMs?: number | null }
 * Set or clear source video duration (ms) on yuja_funny_urls — drives merge/coverage denominator.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      url?: string;
      yujaFunnyUrlsDocId?: string;
      sourceDurationMs?: number | null;
    };
    const referenceUrl = String(body.url || "").trim();
    const bodyDocId = String(body.yujaFunnyUrlsDocId || "").trim();
    if (!referenceUrl && !bodyDocId) {
      return NextResponse.json({ error: "url or yujaFunnyUrlsDocId is required" }, { status: 400 });
    }
    if (!("sourceDurationMs" in body)) {
      return NextResponse.json(
        { error: "sourceDurationMs is required (positive milliseconds, or null to clear)" },
        { status: 400 }
      );
    }

    let docId = bodyDocId;
    if (!docId) {
      try {
        docId = yujaDocIdForUrl(referenceUrl).docId;
      } catch {
        return NextResponse.json({ error: "Invalid reference URL" }, { status: 400 });
      }
    }

    const raw = body.sourceDurationMs;
    const ms =
      raw === null
        ? null
        : typeof raw === "number" && Number.isFinite(raw) && raw > 0
          ? Math.round(raw)
          : null;

    if (raw !== null && ms === null) {
      return NextResponse.json(
        { error: "sourceDurationMs must be a positive number (milliseconds) or null to clear" },
        { status: 400 }
      );
    }

    const db = getDb();
    await setYujaDocSourceDuration(db, docId, ms);

    return NextResponse.json({ ok: true, yujaFunnyUrlsDocId: docId, sourceDurationMs: ms });
  } catch (e) {
    console.error("[homework-capture/source-duration]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save source duration" },
      { status: 500 }
    );
  }
}
