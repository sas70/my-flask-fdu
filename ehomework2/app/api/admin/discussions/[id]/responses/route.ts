import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import { uploadTextToBytescale } from "@/lib/bytescale-upload";

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

    const data = doc.data()!;
    const week = typeof data.week === "number" ? data.week : Number(data.week);
    const responsesText = await file.text();
    const fileName = `discussion-responses/week${week}_${id}.txt`;
    const responsesUrl = await uploadTextToBytescale(responsesText, fileName);

    await ref.update({
      responsesUrl,
      responsesFileName: file.name,
      responsesUploadedAt: FieldValue.serverTimestamp(),
      responsesText: FieldValue.delete(),
    });

    console.info("[admin/discussions/:id/responses POST] uploaded to ByteScale", {
      id,
      chars: responsesText.length,
      responsesUrl,
    });

    return NextResponse.json({ ok: true, chars: responsesText.length, responsesUrl });
  } catch (error) {
    console.error("Responses upload error:", error);
    return NextResponse.json({ error: "Failed to upload responses" }, { status: 500 });
  }
}
