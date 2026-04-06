import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const week = searchParams.get("week");
    const status = searchParams.get("status");

    let query: FirebaseFirestore.Query = db.collection("homeworkSubmissions");

    if (week) {
      query = query.where("week", "==", week);
    }
    if (status) {
      query = query.where("status", "==", status);
    }

    const snap = await query.get();

    const submissions = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        studentName: d.studentName || "Unknown",
        studentId: d.studentId,
        week: d.week,
        status: d.status || "pending",
        grade: d.grade ?? null,
        totalPossible: d.totalPossible ?? null,
        letterGrade: d.letterGrade ?? null,
        createdAt: doc.createTime?.toDate().toISOString() || null,
      };
    });

    // Sort by creation time descending
    submissions.sort((a, b) => {
      if (!a.createdAt || !b.createdAt) return 0;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return NextResponse.json(submissions);
  } catch (error) {
    console.error("Submissions GET error:", error);
    return NextResponse.json({ error: "Failed to fetch submissions" }, { status: 500 });
  }
}
