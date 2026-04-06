import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";

const VALID_ACTIONS = ["retry_rubric", "retry_analysis"] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { action } = await request.json();

    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    const db = getDb();
    const ref = db.collection("discussions").doc(id);
    const doc = await ref.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Discussion not found" }, { status: 404 });
    }

    // Setting status triggers the onDiscussionUpdated Cloud Function
    await ref.update({ status: action });

    return NextResponse.json({ ok: true, status: action });
  } catch (error) {
    console.error("Discussion retry error:", error);
    return NextResponse.json({ error: "Failed to retry" }, { status: 500 });
  }
}
