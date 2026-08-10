"use client";

import { useEffect } from "react";

/**
 * Replaces the root layout when it is the layout itself that failed, so it
 * carries its own <html>/<body> and inline styles (no Tailwind guarantee).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root layout failed:", error);
  }, [error]);

  return (
    <html lang="en-IN">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FAF7F0",
          color: "#1C3A2D",
          fontFamily: "Georgia, 'Times New Roman', serif",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "34rem" }}>
          <p
            style={{
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontSize: "0.9375rem",
              color: "#2C523F",
            }}
          >
            Application error
          </p>
          <h1 style={{ fontSize: "2.875rem", margin: "1.25rem 0", lineHeight: 1.12 }}>
            The site failed to start.
          </h1>
          <p style={{ fontSize: "1.0625rem", color: "#2C523F", lineHeight: 1.6 }}>
            Something broke before the page could render. Reloading usually
            fixes it.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "2rem",
              background: "#D99A2B",
              color: "#10241B",
              border: "none",
              padding: "0.85rem 1.6rem",
              fontSize: "1.0625rem",
              cursor: "pointer",
              borderRadius: "2px",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
