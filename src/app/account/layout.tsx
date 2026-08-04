import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasClerk } from "@/lib/env";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

/**
 * Optional surface. Guest checkout is the default flow and always will
 * be — this exists only for customers who choose to sign in, and it
 * disappears entirely when Clerk is not configured.
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!hasClerk) notFound();

  const { ClerkProvider } = await import("@clerk/nextjs");

  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#1C3A2D",
          colorBackground: "#FAF7F0",
          colorForeground: "#1C3A2D",
          colorInput: "#FAF7F0",
          colorInputForeground: "#1C3A2D",
          colorBorder: "#C9D8CD",
          borderRadius: "2px",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
