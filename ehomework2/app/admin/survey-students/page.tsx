import StudentQuestionnaireUpload from "../_components/StudentQuestionnaireUpload";

export const dynamic = "force-dynamic";

export default function SurveyStudentsPage() {
  return (
    <>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>
        Survey students
      </h1>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: "-0.5rem", marginBottom: "1.5rem" }}>
        Upload and process Google Form exports (preferences, background, learning style). Student roster
        matching uses email first, then fuzzy first and last name.
      </p>
      <StudentQuestionnaireUpload />
    </>
  );
}
