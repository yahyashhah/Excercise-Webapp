import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ToastProvider } from "@/components/providers/toast-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: { default: "RehabAI -- AI-Powered Exercise Platform", template: "%s | RehabAI" },
  description:
    "Personalized AI-powered home exercise programs for clinicians and patients. Generate, assign, and track exercise programs in minutes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${inter.variable} ${plusJakartaSans.variable} font-sans antialiased`}
        >
          <TooltipProvider>
            {children}
            <ToastProvider />
          </TooltipProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
