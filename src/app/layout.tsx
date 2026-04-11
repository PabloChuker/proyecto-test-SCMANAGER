import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/contexts/AuthContext";
import ReferralTracker from "@/components/streamers/ReferralTracker";
// react-grid-layout base CSS (draggable items, placeholders, etc).
// En Next.js App Router solo el root layout puede importar CSS global,
// así que lo hacemos acá en vez de con @import desde globals.css.
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SC LABS — Star Citizen Intelligence Platform",
  description: "Ship database, comparator, mining solver and crafting tools for Star Citizen.",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
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
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <ReferralTracker />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
