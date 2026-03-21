"use client";

import dynamic from "next/dynamic";

const ComposerClient = dynamic(() => import("./composer-client"), {
  ssr: false,
  loading: () => (
    <main style={{ minHeight: "100vh", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", color: "#64748b" }}>Loading composer…</div>
    </main>
  )
});

export default function Page() {
  return <ComposerClient />;
}
