/**
 * Extract the WebM/Matroska initialization segment (everything before the first Cluster)
 * from the first MediaRecorder timeslice.
 *
 * MediaRecorder emits blob 0 = EBML + Segment + … + Tracks + Cluster₁; blobs 1+ are
 * usually raw Cluster payloads only. We prepend the init segment to each later blob
 * so each upload is a standalone file.
 *
 * IMPORTANT: Do not scan for the Cluster ID bytes (0x1F43B675) naïvely — that sequence
 * can appear inside VP8/VP9 compressed frames and truncate the init segment to garbage,
 * producing “empty” or undecodable files for chunk 1+.
 */

const CLUSTER_ID_HEX = "1f43b675";
const SEGMENT_ID_HEX = "18538067";

function ebmlElementIdLength(b0: number): number {
  if (b0 >= 0x80) return 1;
  if (b0 >= 0x40) return 2;
  if (b0 >= 0x20) return 3;
  if (b0 >= 0x10) return 4;
  return 0;
}

/** EBML variable-length integer (used for Element Data Size; same encoding as in node-ebml). */
function readEbmlVint(view: Uint8Array, offset: number): { length: number; value: number } | null {
  if (offset >= view.length) return null;
  const b0 = view[offset];
  if (b0 === 0) return null;
  const length = 8 - Math.floor(Math.log2(b0));
  if (length > 8 || offset + length > view.length) return null;
  const mask = (1 << (8 - length)) - 1;
  let value = b0 & mask;
  for (let i = 1; i < length; i++) {
    value *= 256;
    value += view[offset + i];
  }
  if (length === 8 && value >= 256 && view[offset + 7] > 0) {
    return { length, value: -1 };
  }
  return { length, value };
}

function idHex(view: Uint8Array, offset: number, idLen: number): string {
  let s = "";
  for (let i = 0; i < idLen; i++) {
    s += view[offset + i].toString(16).padStart(2, "0");
  }
  return s;
}

function readEbmlElement(view: Uint8Array, offset: number, parentEnd: number): {
  idHex: string;
  headerEnd: number;
  dataEnd: number;
  next: number;
} | null {
  if (offset >= parentEnd) return null;
  const idLen = ebmlElementIdLength(view[offset]);
  if (idLen === 0 || offset + idLen > parentEnd) return null;
  const idH = idHex(view, offset, idLen);
  const sz = readEbmlVint(view, offset + idLen);
  if (!sz) return null;
  const headerEnd = offset + idLen + sz.length;
  const dataEnd = sz.value < 0 ? parentEnd : headerEnd + sz.value;
  if (dataEnd > parentEnd) return null;
  return { idHex: idH, headerEnd, dataEnd, next: dataEnd };
}

/**
 * Locate first Cluster by walking EBML → Segment → direct children (Chrome MediaRecorder order).
 */
function findFirstClusterInStructure(view: Uint8Array): number {
  const end = view.length;
  let pos = 0;
  while (pos < end) {
    const el = readEbmlElement(view, pos, end);
    if (!el) break;
    if (el.idHex === CLUSTER_ID_HEX) return pos;
    if (el.idHex === SEGMENT_ID_HEX) {
      let c = el.headerEnd;
      while (c < el.dataEnd) {
        const ch = readEbmlElement(view, c, el.dataEnd);
        if (!ch) break;
        if (ch.idHex === CLUSTER_ID_HEX) return c;
        if (ch.next <= c) break;
        c = ch.next;
      }
      return end;
    }
    if (el.next <= pos) break;
    pos = el.next;
  }
  return end;
}

/**
 * Last resort: find Cluster ID bytes only where a plausible EBML size follows (reduces
 * false positives inside VP8/VP9 payload vs. the old raw substring scan).
 */
function findFirstClusterByValidatedScan(view: Uint8Array): number {
  for (let i = 0; i <= view.length - 12; i++) {
    if (
      view[i] !== 0x1f ||
      view[i + 1] !== 0x43 ||
      view[i + 2] !== 0xb6 ||
      view[i + 3] !== 0x75
    ) {
      continue;
    }
    const sz = readEbmlVint(view, i + 4);
    if (!sz) continue;
    const headerEnd = i + 4 + sz.length;
    const payloadEnd = sz.value < 0 ? view.length : headerEnd + sz.value;
    if (headerEnd > view.length || payloadEnd > view.length) continue;
    return i;
  }
  return view.length;
}

/** First Cluster element offset, or `view.length` if none. */
export function findFirstClusterByteOffset(view: Uint8Array): number {
  const structured = findFirstClusterInStructure(view);
  if (structured < view.length) return structured;
  return findFirstClusterByValidatedScan(view);
}

export function extractWebmInitSegment(buf: ArrayBuffer): ArrayBuffer {
  const view = new Uint8Array(buf);
  const cut = findFirstClusterByteOffset(view);
  if (cut <= 0 || cut >= buf.byteLength) return buf;
  return buf.slice(0, cut);
}
