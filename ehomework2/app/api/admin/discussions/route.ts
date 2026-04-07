import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";

export async function GET() {
  try {
    const db = getDb();
    const snap = await db.collection("discussions").orderBy("week", "desc").get();

    const discussions = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.createTime?.toDate().toISOString() || null,
    }));

    return NextResponse.json(discussions);
  } catch (error) {
    console.error("[admin/discussions GET] error:", error);
    return NextResponse.json({ error: "Failed to fetch discussions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const week = formData.get("week") as string;
    const title = formData.get("title") as string;
    const promptText = formData.get("promptText") as string || "";
    const promptFiles = formData.getAll("promptFiles") as File[];

    if (!week || !title) {
      console.warn("[admin/discussions POST] validation failed: week and title required");
      return NextResponse.json(
        { error: "week and title are required" },
        { status: 400 }
      );
    }

    // Read file contents and combine with typed prompt text
    const fileTexts: string[] = [];
    const promptFileUrls: string[] = [];

    for (const file of promptFiles) {
      if (file.size > 0) {
        const text = await file.text();
        fileTexts.push(`--- File: ${file.name} ---\n${text}`);
        // We store the text inline; no need to upload prompt files to ByteScale
        // since they become part of promptText
      }
    }

    const combinedPrompt = [
      promptText,
      ...fileTexts,
    ].filter(Boolean).join("\n\n");

    if (!combinedPrompt.trim()) {
      console.warn("[admin/discussions POST] validation failed: empty prompt");
      return NextResponse.json(
        { error: "Either prompt text or a prompt file is required" },
        { status: 400 }
      );
    }

    const db = getDb();

    const doc = {
      week: Number(week),
      title,
      promptText: combinedPrompt,
      promptFileUrls,
      status: "pending",
    };

    const ref = await db.collection("discussions").add(doc);

    console.info("[admin/discussions POST] created Firestore doc", {
      discussionId: ref.id,
      week: doc.week,
      status: doc.status,
      note: "Cloud Function onDiscussionCreated should run for this new document",
    });

    return NextResponse.json({ id: ref.id, ...doc }, { status: 201 });
  } catch (error) {
    console.error("[admin/discussions POST] error:", error);
    return NextResponse.json({ error: "Failed to create discussion" }, { status: 500 });
  }
}
