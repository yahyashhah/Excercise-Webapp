import type { Metadata } from "next";
import { Inter, Lexend } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ToastProvider } from "@/components/providers/toast-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClipboardProvider } from "@/lib/clipboard-context";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: { default: "INMOTUS RX", template: "%s | INMOTUS RX" },
  description:
    "Personalized AI-powered home exercise programs for trainers and clients. Generate, assign, and track exercise programs in minutes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      localization={{
        signIn: {
          start: {
            title: "Sign in to Inmotus RX",
          },
        },
      }}
    >
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${inter.variable} ${lexend.variable} font-sans antialiased`}
        >
          <TooltipProvider>
            <ClipboardProvider>
              {children}
              <ToastProvider />
            </ClipboardProvider>
          </TooltipProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
