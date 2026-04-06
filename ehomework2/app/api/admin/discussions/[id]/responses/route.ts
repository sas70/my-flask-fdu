import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const ref = db.collection("discussions").doc(id);
    const doc = await ref.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Discussion not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("responsesFile") as File;

    if (!file || file.size === 0) {
      return NextResponse.json(
        { error: "A responses .txt file is required" },
        { status: 400 }
      );
    }

    const responsesText = await file.text();

    // Store responses text in Firestore — the onUpdate trigger will pick it up
    // and run analysis if the rubric is ready
    await ref.update({
      responsesText: responsesText.substring(0, 100000),
      responsesFileName: file.name,
    });

    return NextResponse.json({ ok: true, chars: responsesText.length });
  } catch (error) {
    console.error("Responses upload error:", error);
    return NextResponse.json({ error: "Failed to upload responses" }, { status: 500 });
  }
}
