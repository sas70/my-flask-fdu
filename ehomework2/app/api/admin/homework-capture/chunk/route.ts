import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";
import { uploadBinaryToBytescale } from "@/lib/bytescale-binary";
import { getHomeworkCaptureChunkMs } from "@/lib/homework-capture-constants";
import {
  getOrCreateYujaDoc,
  writeYujaSegmentChunk,
  yujaDocIdForUrl,
} from "@/lib/yuja-funny-urls";

function parseOptionalDurationMs(raw: FormDataEntryValue | null): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = typeof raw === "string" ? Number(raw) : Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 3_600_000) return undefined;
  return Math.round(n);
}

function parseOptionalInt(raw: FormDataEntryValue | null): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = typeof raw === "string" ? Number(raw) : Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 0x7fffffff) return undefined;
  return Math.floor(n);
}

function computeChunkTimeline(
  chunkIndex: number,
  chunkLengthNominalMs: number,
  durationOverrideMs?: number
): {
  startOffsetMs: number;
  endOffsetMs: number;
  durationMs: number;
  durationSource: "nominal" | "client";
} {
  const startOffsetMs = chunkIndex * chunkLengthNominalMs;
  const durationSource =
    typeof durationOverrideMs === "number" && durationOverrideMs > 0 ? "client" : "nominal";
  const durationMs =
    durationSource === "client" && typeof durationOverrideMs === "number"
      ? durationOverrideMs
      : chunkLengthNominalMs;
  const endOffsetMs = startOffsetMs + durationMs;
  return { startOffsetMs, endOffsetMs, durationMs, durationSource };
}

export const maxDuration = 60;

/** Vercel ~4.5 MB max body; local dev allows larger chunks after next.config body limits. */
const MAX_CHUNK_BYTES = process.env.VERCEL ? 4_200_000 : 32 * 1024 * 1024;

/** Below this, combined WebM is often broken (bad init merge) or empty media — see terminal warnings. */
const WARN_COMBINED_BYTES = 2_048;

/**
 * Upload one recorded chunk. The URL is the identity; no session concept.
 *
 * Form fields:
 *   - url (required): reference playback URL
 *   - chunkIndex (required): non-negative integer
 *   - file (required): the WebM blob
 *   - durationMs (optional): client-measured chunk duration
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const referenceUrl = String(formData.get("url") || "").trim();
    const indexRaw = formData.get("chunkIndex");
    const chunkIndex = typeof indexRaw === "string" ? Number(indexRaw) : Number(indexRaw ?? NaN);
    const file = formData.get("file");

    if (!referenceUrl) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
      return NextResponse.json({ error: "chunkIndex must be a non-negative integer" }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      console.warn(`[homework-capture/chunk] reject empty file chunkIndex=${chunkIndex}`);
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_CHUNK_BYTES) {
      return NextResponse.json(
        {
          error: `Chunk too large (${file.size} bytes). Max ${MAX_CHUNK_BYTES} bytes per request${
            process.env.VERCEL
              ? " (Vercel limit). Shorten NEXT_PUBLIC_HOMEWORK_CAPTURE_CHUNK_MS or record at lower quality."
              : "."
          }`,
        },
        { status: 413 }
      );
    }

    let docId: string;
    try {
      docId = yujaDocIdForUrl(referenceUrl).docId;
    } catch {
      return NextResponse.json({ error: "Invalid reference URL" }, { status: 400 });
    }

    const db = getDb();
    const chunkLengthNominalMs = getHomeworkCaptureChunkMs();

    // Create the yuja doc lazily on first chunk upload.
    await getOrCreateYujaDoc(db, referenceUrl, { chunkMs: chunkLengthNominalMs });

    const buf = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "video/webm";

    const diagRaw = parseOptionalInt(formData.get("diagRawSliceBytes"));
    const diagInit = parseOptionalInt(formData.get("diagInitSegmentBytes"));
    const diagCluster = parseOptionalInt(formData.get("diagClusterOffset"));
    const headHex = buf.length >= 8 ? buf.subarray(0, 8).toString("hex") : "";

    console.log(
      `[homework-capture/chunk] ok chunkIndex=${chunkIndex} bytes=${buf.length} mime=${mime} doc=${docId.slice(0, 12)}…` +
        (diagRaw != null || diagInit != null || diagCluster != null
          ? ` diag rawSlice=${diagRaw ?? "—"} initSeg=${diagInit ?? "—"} clusterOff=${diagCluster ?? "—"}`
          : "") +
        ` head8=${headHex}`
    );
    if (buf.length < WARN_COMBINED_BYTES) {
      console.warn(
        `[homework-capture/chunk] WARN very small combined WebM (${buf.length} bytes) — often broken init merge or empty media; chunkIndex=${chunkIndex}`
      );
    }
    if (chunkIndex > 0 && diagInit != null && diagInit < 64) {
      console.warn(
        `[homework-capture/chunk] WARN tiny init segment (${diagInit} bytes) — prepended chunks may be undecodable; chunkIndex=${chunkIndex}`
      );
    }

    const name = `capture_${docId.slice(0, 12)}_part${String(chunkIndex).padStart(4, "0")}.webm`;
    const prefix = `homework/capture/${docId}`;
    const fileUrl = await uploadBinaryToBytescale(buf, `${prefix}_${name}`, mime);

    const durationOverride = parseOptionalDurationMs(formData.get("durationMs"));
    const timeline = computeChunkTimeline(chunkIndex, chunkLengthNominalMs, durationOverride);

    await writeYujaSegmentChunk(db, docId, chunkIndex, {
      chunkUrl: fileUrl,
      chunkMimeType: mime,
      chunkName: name,
      startOffsetMs: timeline.startOffsetMs,
      endOffsetMs: timeline.endOffsetMs,
      durationMs: timeline.durationMs,
      chunkLengthNominalMs,
      durationSource: timeline.durationSource,
    });

    return NextResponse.json({
      ok: true,
      yujaFunnyUrlsDocId: docId,
      chunkIndex,
      url: fileUrl,
    });
  } catch (e) {
    console.error("[homework-capture/chunk]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Chunk upload failed" },
      { status: 500 }
    );
  }
}
