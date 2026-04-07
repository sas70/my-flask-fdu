import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const doc = await db.collection("discussions").doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Discussion not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.createTime?.toDate().toISOString() || null,
    });
  } catch (error) {
    console.error("[admin/discussions GET id] error:", error);
    return NextResponse.json({ error: "Failed to fetch discussion" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formData = await request.formData();
    const week = formData.get("week") as string;
    const title = formData.get("title") as string;
    const promptText = (formData.get("promptText") as string) || "";
    const promptFiles = formData.getAll("promptFiles") as File[];

    if (!week || !title) {
      console.warn("[admin/discussions PATCH] validation failed: week and title required");
      return NextResponse.json(
        { error: "week and title are required" },
        { status: 400 }
      );
    }

    const fileTexts: string[] = [];
    for (const file of promptFiles) {
      if (file.size > 0) {
        const text = await file.text();
        fileTexts.push(`--- File: ${file.name} ---\n${text}`);
      }
    }

    const combinedPrompt = [promptText, ...fileTexts].filter(Boolean).join("\n\n");

    if (!combinedPrompt.trim()) {
      console.warn("[admin/discussions PATCH] validation failed: empty prompt");
      return NextResponse.json(
        { error: "Either prompt text or a prompt file is required" },
        { status: 400 }
      );
    }

    const db = getDb();
    const ref = db.collection("discussions").doc(id);
    const existing = await ref.get();

    if (!existing.exists) {
      return NextResponse.json({ error: "Discussion not found" }, { status: 404 });
    }

    const updates = {
      week: Number(week),
      title,
      promptText: combinedPrompt,
    };

    await ref.update(updates);

    console.info("[admin/discussions PATCH] updated Firestore doc", {
      discussionId: id,
      week: updates.week,
      note: "Prompt text changed; regenerate rubric via Retry if needed",
    });

    return NextResponse.json({ id, ...updates }, { status: 200 });
  } catch (error) {
    console.error("[admin/discussions PATCH] error:", error);
    return NextResponse.json({ error: "Failed to update discussion" }, { status: 500 });
  }
}
