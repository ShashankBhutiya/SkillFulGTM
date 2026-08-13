import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#07070b",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "SkillfulGTM — Agentic GTM Outbound Pipeline",
    template: "%s | SkillfulGTM",
  },
  description:
    "Agentic GTM — company in, ideal customer profile out, decision-makers found, personalized outreach sent.",
  keywords: ["GTM", "Agentic Sales", "Outbound Email", "AI SDR", "ICP Generator", "Exa", "Hunter"],
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "SkillfulGTM — Agentic GTM Outbound Pipeline",
    description:
      "Describe your company. Get a pipeline, not a lead list. Powered by Gemini, Exa, and Hunter.",
    siteName: "SkillfulGTM",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SkillfulGTM — Agentic GTM Outbound Pipeline",
    description: "Describe your company. Get a pipeline, not a lead list.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5738225999817138"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      </head>
      {/* Content sits above the fixed ambient gradient and grid drawn on <body>. */}
      <body className="min-h-screen antialiased">
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}

