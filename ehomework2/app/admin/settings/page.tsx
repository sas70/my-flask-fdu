import ProfileForm from "../_components/ProfileForm";
import DocumentUpload from "../_components/DocumentUpload";
import PromptsEditor from "../_components/PromptsEditor";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>
        Settings
      </h1>

      <ProfileForm />

      <h2
        style={{
          fontSize: "1.1rem",
          fontWeight: 600,
          marginBottom: "0.75rem",
          marginTop: 0,
        }}
      >
        Instructor uploads
      </h2>
      <DocumentUpload />

      <PromptsEditor />
    </>
  );
}
