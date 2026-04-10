import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 15;

/**
 * Legacy alias: older Tab Capture clients polled `yuja-status?sessionId=…`.
 * Sessions were removed — state is keyed only by reference URL (`yuja-state?url=…`).
 * - `sessionId` without `url` → 410 + message (stop 404 spam; user should hard-refresh).
 * - Otherwise → same behavior as GET /yuja-state.
 */
export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const refUrl = String(sp.get("url") || "").trim();
  const sessionId = String(sp.get("sessionId") || "").trim();
  if (sessionId && !refUrl) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Session-based tab capture was removed. Hard-refresh this page (Cmd+Shift+R or Ctrl+Shift+R) so the app uses your reference URL with /yuja-state.",
      },
      { status: 410 }
    );
  }
  const { GET: yujaStateGet } = await import("../yuja-state/route");
  return yujaStateGet(request);
}
