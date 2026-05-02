import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { AuthProvider } from "@/contexts/AuthContext";
import ReferralTracker from "@/components/streamers/ReferralTracker";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
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

// Viewport meta — sin esto iOS Safari renderiza a 980px y aplica zoom-out,
// rompiendo cualquier diseño responsive. Next 16 App Router lo expone como
// export aparte (separado de metadata).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0a0a0a",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthProvider>
            <ReferralTracker />
            {children}
          </AuthProvider>
        </NextIntlClientProvider>
        {/* Vercel Analytics + Speed Insights — privacy-friendly, sin cookies. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
