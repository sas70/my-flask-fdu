import Link from "next/link";
import LogoutButton from "./_components/LogoutButton";
import "./admin.css";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh" }}>
      {/* ── Sidebar ── */}
      <aside className="admin-sidebar">
        <Link href="/admin" className="admin-sidebar-brand">
          <span style={{ fontSize: "1.25rem" }}>G</span>radeFlow
        </Link>

        <nav className="admin-sidebar-nav">
          <div className="admin-sidebar-section">Overview</div>
          <Link href="/admin" className="admin-sidebar-link">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5l-5.5 5V14a1 1 0 001 1h3a1 1 0 001-1v-3h1v3a1 1 0 001 1h3a1 1 0 001-1V6.5L8 1.5z"/></svg>
            Dashboard
          </Link>

          <div className="admin-sidebar-section" style={{ marginTop: "0.75rem" }}>Homework</div>
          <Link href="/admin/assignments" className="admin-sidebar-link">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v9a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5v-9zM3.5 3a.5.5 0 00-.5.5v9a.5.5 0 00.5.5h9a.5.5 0 00.5-.5v-9a.5.5 0 00-.5-.5h-9z"/><path d="M5 6.5A.5.5 0 015.5 6h5a.5.5 0 010 1h-5A.5.5 0 015 6.5zM5 8.5A.5.5 0 015.5 8h5a.5.5 0 010 1h-5A.5.5 0 015 8.5zM5 10.5a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3a.5.5 0 01-.5-.5z"/></svg>
            Assignments
          </Link>
          <Link href="/admin/submissions" className="admin-sidebar-link">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4.406 1.342A5.53 5.53 0 018 0c2.69 0 4.923 2 5.166 4.579C14.758 4.804 16 6.137 16 7.773 16 9.569 14.502 11 12.687 11H10a.5.5 0 010-1h2.688C13.979 10 15 8.988 15 7.773c0-1.216-1.02-2.228-2.313-2.228h-.5v-.5C12.188 2.825 10.328 1 8 1a4.53 4.53 0 00-2.941 1.1c-.757.652-1.153 1.438-1.153 2.055v.448l-.445.049C2.064 4.805 1 5.952 1 7.318 1 8.785 2.23 10 3.781 10H6a.5.5 0 010 1H3.781C1.708 11 0 9.366 0 7.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383z"/><path d="M7.646 4.146a.5.5 0 01.708 0l3 3a.5.5 0 01-.708.708L8.5 5.707V14.5a.5.5 0 01-1 0V5.707L5.354 7.854a.5.5 0 11-.708-.708l3-3z"/></svg>
            Submissions
          </Link>

          <div className="admin-sidebar-section" style={{ marginTop: "0.75rem" }}>Discussions</div>
          <Link href="/admin/discussions" className="admin-sidebar-link">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M14 1a1 1 0 011 1v8a1 1 0 01-1 1h-2.5a2 2 0 00-1.6.8L8 14.333 6.1 11.8a2 2 0 00-1.6-.8H2a1 1 0 01-1-1V2a1 1 0 011-1h12zM2 0a2 2 0 00-2 2v8a2 2 0 002 2h2.5a1 1 0 01.8.4l1.9 2.533a1 1 0 001.6 0l1.9-2.533a1 1 0 01.8-.4H14a2 2 0 002-2V2a2 2 0 00-2-2H2z"/></svg>
            Prompts
          </Link>
          <Link href="/admin/responses" className="admin-sidebar-link">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M0 4.5A2.5 2.5 0 012.5 2h11A2.5 2.5 0 0116 4.5v7a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 010 11.5v-7zM2.5 3A1.5 1.5 0 001 4.5v7A1.5 1.5 0 002.5 13h11a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0013.5 3h-11z"/><path d="M5 6.5A.5.5 0 015.5 6h5a.5.5 0 010 1h-5A.5.5 0 015 6.5zM5 8.5A.5.5 0 015.5 8h5a.5.5 0 010 1h-5A.5.5 0 015 8.5z"/></svg>
            Responses
          </Link>

          <div className="admin-sidebar-section" style={{ marginTop: "0.75rem" }}>Manage</div>
          <Link href="/admin/students" className="admin-sidebar-link">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M15 14s1 0 1-1-1-4-5-4-5 3-5 4 1 1 1 1h8zm-7.978-1A.261.261 0 017 12.996c.001-.264.167-1.03.76-1.72C8.312 10.629 9.282 10 11 10c1.717 0 2.687.63 3.24 1.276.593.69.758 1.457.76 1.72l-.008.002a.274.274 0 01-.014.002H7.022zM11 7a2 2 0 100-4 2 2 0 000 4zm3-2a3 3 0 11-6 0 3 3 0 016 0zM6.936 9.28a5.88 5.88 0 00-1.23-.247A7.35 7.35 0 005 9c-4 0-5 3-5 4 0 .667.333 1 1 1h4.216A2.238 2.238 0 015 13c0-.779.357-1.85 1.084-2.828.254-.339.546-.657.852-.948zM4.92 10A5.493 5.493 0 004 13H1c0-.26.164-1.03.76-1.724.545-.636 1.492-1.256 3.16-1.275zM1.5 5.5a3 3 0 116 0 3 3 0 01-6 0zm3-2a2 2 0 100 4 2 2 0 000-4z"/></svg>
            Students
          </Link>
          <Link href="/admin/survey-students" className="admin-sidebar-link">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M4 1.5H3a2 2 0 00-2 2V14a2 2 0 002 2h10a2 2 0 002-2V3.5a2 2 0 00-2-2h-1v1h1a1 1 0 011 1V14a1 1 0 01-1 1H3a1 1 0 01-1-1V3.5a1 1 0 011-1h1v-1z" />
              <path d="M9.5 1a.5.5 0 01.5.5v1a.5.5 0 01-.5.5h-3a.5.5 0 01-.5-.5v-1a.5.5 0 01.5-.5h3zm-3-1A1.5 1.5 0 005 1.5v1A1.5 1.5 0 006.5 4h3A1.5 1.5 0 0011 2.5v-1A1.5 1.5 0 009.5 0h-3z" />
              <path d="M4.5 6.5A.5.5 0 015 6h6a.5.5 0 010 1H5a.5.5 0 01-.5-.5zm0 2A.5.5 0 015 8h6a.5.5 0 010 1H5a.5.5 0 01-.5-.5zm0 2A.5.5 0 015 10h3a.5.5 0 010 1h-3a.5.5 0 01-.5-.5z" />
            </svg>
            Survey students
          </Link>
          <Link href="/admin/students-introduction" className="admin-sidebar-link">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M5 4a.5.5 0 000 1h6a.5.5 0 000-1H5zm-.5 2.5A.5.5 0 015 6h6a.5.5 0 010 1H5a.5.5 0 01-.5-.5zm0 2A.5.5 0 015 8h6a.5.5 0 010 1H5a.5.5 0 01-.5-.5zm0 2a.5.5 0 01.5-.5h4a.5.5 0 010 1H5a.5.5 0 01-.5-.5z" />
              <path d="M2 2a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V2zm2-1a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V2a1 1 0 00-1-1H4z" />
            </svg>
            Students introduction
          </Link>
          <Link href="/admin/settings" className="admin-sidebar-link">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4.754a3.246 3.246 0 100 6.492 3.246 3.246 0 000-6.492zM5.754 8a2.246 2.246 0 114.492 0 2.246 2.246 0 01-4.492 0z"/><path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 01-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 01-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 01.52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 011.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 011.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 01.52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 01-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 01-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 002.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 001.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 00-1.115 2.693l.16.291c.415.764-.421 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 00-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 00-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 001.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 003.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 002.692-1.116l.094-.318z"/></svg>
            Settings
          </Link>
        </nav>

        <div className="admin-sidebar-footer">
          <LogoutButton />
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="admin-main">
        <div className="admin-content">
          {children}
        </div>
      </div>
    </div>
  );
}
