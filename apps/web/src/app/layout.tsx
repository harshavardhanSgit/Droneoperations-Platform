import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/core/auth/auth-context";
import { ThemeProvider } from "@/core/theme/theme-context";
import { THEME_SCRIPT } from "@/core/theme/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Drone Operations Platform",
  description: "Drone services for agriculture, on demand — compare providers, see the price upfront, and book the job.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Blocking, inline, and before anything else paints. A deferred script
          or a React effect runs only after the first paint, so a dark-mode
          user would see a white flash on every navigation.

          suppressHydrationWarning on <html> above is required: this script
          mutates the very attribute React is about to reconcile, which React
          would otherwise report as a server/client mismatch.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <AppShell>{children}</AppShell>
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
