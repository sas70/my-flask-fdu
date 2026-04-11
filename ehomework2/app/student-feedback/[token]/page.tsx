import StudentFeedbackClient from "./StudentFeedbackClient";

export const dynamic = "force-dynamic";

export default async function StudentFeedbackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <StudentFeedbackClient token={token} />;
}
