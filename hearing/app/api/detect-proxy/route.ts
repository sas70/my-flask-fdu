import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const DEV_DEFAULT_FLASK_BASE = "http://127.0.0.1:5050";

/**
 * Resolves Flask POST /api/detect URL.
 * - In development, defaults to http://127.0.0.1:5050/api/detect if FLASK_DETECT_URL is unset.
 * - If FLASK_DETECT_URL is a base only (e.g. http://127.0.0.1:5050/), appends /api/detect.
 */
function resolveFlaskDetectUrl(): string | null {
  const raw = process.env.FLASK_DETECT_URL?.trim();
  if (raw) {
    const base = raw.replace(/\/$/, "");
    if (/\/api\/detect$/i.test(base)) return base;
    return `${base}/api/detect`;
  }
  if (process.env.NODE_ENV === "development") {
    return `${DEV_DEFAULT_FLASK_BASE}/api/detect`;
  }
  return null;
}

/** Primary field name Flask expects (many apps use `file` or `image`). */
const PRIMARY_FILE_FIELD = process.env.FLASK_DETECT_FILE_FIELD?.trim() || "file";
/** If set (e.g. `image`), also attach the same file under this name for compatibility. */
const SECONDARY_FILE_FIELD = process.env.FLASK_DETECT_FILE_FIELD_ALT?.trim() || "image";

/**
 * Forwards to Flask POST /api/detect:
 * - application/json → forwarded as JSON (legacy image_urls flow)
 * - Everything else → parsed as multipart FormData, file forwarded to Flask
 */
export async function POST(req: NextRequest) {
  const target = resolveFlaskDetectUrl();
  if (!target) {
    return NextResponse.json(
      { ok: false, error: "FLASK_DETECT_URL is not configured (required outside development)" },
      { status: 503 }
    );
  }

  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();

  try {
    let res: Response;

    if (contentType.includes("application/json")) {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
      }
      res = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store"
      });
    } else {
      let formData: FormData;
      try {
        formData = await req.formData();
      } catch {
        return NextResponse.json(
          { ok: false, error: "Could not read multipart body" },
          { status: 400 }
        );
      }

      const file =
        formData.get("file") ??
        formData.get("image") ??
        formData.get("upload") ??
        formData.get("photo");

      if (!file || typeof file === "string") {
        return NextResponse.json(
          {
            ok: false,
            error:
              "No file in request. Send multipart/form-data with a file field named `file` (or `image` / `upload`)."
          },
          { status: 400 }
        );
      }

      const fileName = file instanceof File ? file.name : "upload.jpg";
      const outbound = new FormData();
      outbound.append(PRIMARY_FILE_FIELD, file, fileName);
      if (SECONDARY_FILE_FIELD && SECONDARY_FILE_FIELD !== PRIMARY_FILE_FIELD) {
        outbound.append(SECONDARY_FILE_FIELD, file, fileName);
      }

      const upscale = formData.get("upscale");
      const bytescale = formData.get("bytescale");
      if (upscale != null) outbound.append("upscale", String(upscale));
      else outbound.append("upscale", "true");
      if (bytescale != null) outbound.append("bytescale", String(bytescale));
      else outbound.append("bytescale", "true");

      res = await fetch(target, {
        method: "POST",
        body: outbound,
        cache: "no-store"
      });
    }

    const text = await res.text();
    let data: unknown = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { ok: false, error: "Flask returned non-JSON", raw: text.slice(0, 500) };
    }

    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Proxy request failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
