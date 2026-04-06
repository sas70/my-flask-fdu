import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const doc = await db.collection("homeworkSubmissions").doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.createTime?.toDate().toISOString() || null,
    });
  } catch (error) {
    console.error("Submission GET error:", error);
    return NextResponse.json({ error: "Failed to fetch submission" }, { status: 500 });
  }
}
