import Link from "next/link";
import LogoutButton from "./_components/LogoutButton";

const navLink = {
  color: "var(--muted)",
  textDecoration: "none",
  fontSize: "0.9rem",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh" }}>
      <nav
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "0.75rem 1.5rem",
          display: "flex",
          alignItems: "center",
          gap: "1.5rem",
        }}
      >
        <Link href="/admin" style={{ fontWeight: 600, fontSize: "1rem", color: "var(--text)", textDecoration: "none" }}>
          GradeFlow
        </Link>
        <Link href="/admin" style={navLink}>Dashboard</Link>
        <Link href="/admin/assignments" style={navLink}>Assignments</Link>
        <Link href="/admin/submissions" style={navLink}>Submissions</Link>
        <Link href="/admin/students" style={navLink}>Students</Link>
        <Link href="/admin/discussions" style={navLink}>Discussions</Link>
        <Link href="/admin/settings" style={navLink}>Settings</Link>
        <div style={{ marginLeft: "auto" }}>
          <LogoutButton />
        </div>
      </nav>
      <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "2rem 1.5rem" }}>
        {children}
      </main>
    </div>
  );
}
