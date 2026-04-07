import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";

/**
 * Firestore matches `week` type strictly (number vs string). Try both so uploads
 * still find the doc if `week` was saved as a string in the console or an older client.
 */
async function findDiscussionByWeek(
  db: Firestore,
  weekRaw: string
): Promise<QueryDocumentSnapshot | null> {
  const n = Number(weekRaw);
  if (Number.isNaN(n)) return null;

  const queries = [
    db.collection("discussions").where("week", "==", n).limit(1),
    db.collection("discussions").where("week", "==", String(n)).limit(1),
  ];

  for (const q of queries) {
    const snap = await q.get();
    if (!snap.empty) return snap.docs[0];
  }

  return null;
}

/**
 * Upload discussion responses by week number.
 * Finds the discussion for that week, attaches the responses .txt,
 * and the Cloud Function onUpdate trigger will run analysis if rubric is ready.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const week = formData.get("week") as string;
    const file = formData.get("responsesFile") as File;

    if (!week) {
      return NextResponse.json({ error: "Week is required" }, { status: 400 });
    }
    if (!file || file.size === 0) {
      return NextResponse.json({ error: "A responses .txt file is required" }, { status: 400 });
    }

    const db = getDb();

    const discussionDoc = await findDiscussionByWeek(db, week);

    if (!discussionDoc) {
      console.warn("[admin/responses POST] no discussion for week", week);
      return NextResponse.json(
        {
          error: `No discussion prompt found for Week ${week}. Create a discussion prompt first, and ensure its "week" field is the number ${Number(week)} (not text) in Firestore.`,
        },
        { status: 404 }
      );
    }

    const discussion = discussionDoc.data();

    const responsesText = await file.text();

    await discussionDoc.ref.update({
      responsesText: responsesText.substring(0, 100000),
      responsesFileName: file.name,
      responsesUploadedAt: FieldValue.serverTimestamp(),
    });

    console.info("[admin/responses POST] saved responses", {
      discussionId: discussionDoc.id,
      week: discussion.week,
      chars: responsesText.length,
    });

    return NextResponse.json({
      ok: true,
      discussionId: discussionDoc.id,
      week: discussion.week,
      title: discussion.title,
      chars: responsesText.length,
    });
  } catch (error) {
    console.error("[admin/responses POST] error:", error);
    return NextResponse.json({ error: "Failed to upload responses" }, { status: 500 });
  }
}
