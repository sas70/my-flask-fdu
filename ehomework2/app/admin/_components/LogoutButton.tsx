"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <button
      onClick={handleLogout}
      style={{
        background: "transparent",
        border: "1px solid var(--border)",
        color: "var(--muted)",
        padding: "0.4rem 0.75rem",
        borderRadius: "0.375rem",
        fontSize: "0.8rem",
        cursor: "pointer",
      }}
    >
      Sign out
    </button>
  );
}
