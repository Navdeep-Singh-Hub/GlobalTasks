"use client";

import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/auth-context";
import { CelebrationProvider } from "@/contexts/celebration-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <CelebrationProvider>{children}</CelebrationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
