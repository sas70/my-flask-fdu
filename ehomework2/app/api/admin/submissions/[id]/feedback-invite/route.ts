import { randomBytes } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";

export const maxDuration = 30;

function publicOrigin(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (env) return env;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return host ? `${proto}://${host}` : "";
}

/**
 * Create or rotate a secret link token so the student can open /student-feedback/[token]
 * and submit written responses to the grading report (no login).
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const ref = db.collection("homeworkSubmissions").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    const token = randomBytes(32).toString("hex");
    await ref.update({
      studentFeedbackToken: token,
      studentFeedbackInviteCreatedAt: FieldValue.serverTimestamp(),
    });

    const origin = publicOrigin(_request);
    const url = origin ? `${origin}/student-feedback/${token}` : `/student-feedback/${token}`;

    return NextResponse.json({ ok: true, token, url });
  } catch (e) {
    console.error("[feedback-invite]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create invite" },
      { status: 500 }
    );
  }
}
