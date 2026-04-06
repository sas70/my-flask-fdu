import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";

export async function GET() {
  try {
    const db = getDb();

    const [assignmentsSnap, submissionsSnap, discussionsSnap] = await Promise.all([
      db.collection("assignments").get(),
      db.collection("homeworkSubmissions").get(),
      db.collection("discussions").get(),
    ]);

    const byStatus: Record<string, number> = {};
    const recent: Array<{
      id: string;
      studentName: string;
      week: string;
      status: string;
      grade?: number;
      letterGrade?: string;
    }> = [];

    submissionsSnap.forEach((doc) => {
      const d = doc.data();
      const status = d.status || "pending";
      byStatus[status] = (byStatus[status] || 0) + 1;
      recent.push({
        id: doc.id,
        studentName: d.studentName || "Unknown",
        week: d.week,
        status,
        grade: d.grade,
        letterGrade: d.letterGrade,
      });
    });

    // Sort by doc createTime descending and take 10
    recent.sort((a, b) => {
      const docA = submissionsSnap.docs.find((d) => d.id === a.id);
      const docB = submissionsSnap.docs.find((d) => d.id === b.id);
      const tA = docA?.createTime?.toMillis() || 0;
      const tB = docB?.createTime?.toMillis() || 0;
      return tB - tA;
    });

    const discussionsByStatus: Record<string, number> = {};
    discussionsSnap.forEach((doc) => {
      const status = doc.data().status || "pending";
      discussionsByStatus[status] = (discussionsByStatus[status] || 0) + 1;
    });

    return NextResponse.json({
      assignments: { total: assignmentsSnap.size },
      submissions: {
        total: submissionsSnap.size,
        byStatus,
        recent: recent.slice(0, 10),
      },
      discussions: {
        total: discussionsSnap.size,
        byStatus: discussionsByStatus,
      },
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
