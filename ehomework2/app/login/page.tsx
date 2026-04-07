"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        setError("Invalid password");
        return;
      }

      router.push("/admin");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "1.5rem",
        background: "#0a0e14",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "380px",
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: "12px",
          padding: "2.5rem 2rem",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "rgba(88,166,255,0.15)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "1rem",
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "#58a6ff",
            }}
          >
            G
          </div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#e6edf3", marginBottom: "0.25rem" }}>
            GradeFlow
          </h1>
          <p style={{ color: "#8b949e", fontSize: "0.85rem" }}>
            Sign in to your admin dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.8rem",
                fontWeight: 500,
                color: "#c9d1d9",
                marginBottom: "0.35rem",
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoFocus
              style={{
                width: "100%",
                padding: "0.6rem 0.75rem",
                background: "#0f1419",
                border: "1px solid #30363d",
                borderRadius: "8px",
                color: "#e6edf3",
                fontSize: "0.9rem",
                outline: "none",
              }}
            />
          </div>

          {error && (
            <div
              style={{
                padding: "0.5rem 0.75rem",
                background: "rgba(248,81,73,0.15)",
                color: "#f85149",
                borderRadius: "8px",
                fontSize: "0.85rem",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "0.65rem",
              background: "#58a6ff",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontSize: "0.9rem",
              fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
