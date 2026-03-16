"use client";

// Clerk handles auth via ClerkProvider in app/layout.tsx.
// This component is a no-op wrapper kept for compatibility.
interface SessionProviderProps {
  children: React.ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  return <>{children}</>;
}
