import StudentIntroductionUpload from "../_components/StudentIntroductionUpload";

export const dynamic = "force-dynamic";

export default function StudentsIntroductionPage() {
  return (
    <>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>
        Students introduction
      </h1>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: "-0.5rem", marginBottom: "1.5rem" }}>
        Upload one text file containing class introductions. The pipeline matches names to your
        Students roster and saves each introduction as that student’s bio.
      </p>
      <StudentIntroductionUpload />
    </>
  );
}
