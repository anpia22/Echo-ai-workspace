import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { withSeo } from "@/lib/seo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const defaultTitle = "Echo: The AI workspace that thinks with you";
const defaultDescription =
  "Describe a messy product or architecture problem. Echo drafts a map of problems, options, decisions and tasks, you reshape it, and the AI works from your version. Free during beta.";

const metadataBase = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://echo-ai-workspace.vercel.app")
);

// Home is a client page, so its title lives here as `title.default`.
// An override replaces that default only; the "%s | Echo" template stays for other routes.
const home = withSeo("/", {
  title: { absolute: defaultTitle },
  description: defaultDescription,
  openGraph: {
    title: defaultTitle,
    description: defaultDescription,
    type: "website",
    siteName: "Echo",
  },
  twitter: { card: "summary_large_image" },
});

const homeTitle =
  home.title && typeof home.title === "object" && "absolute" in home.title && home.title.absolute
    ? home.title.absolute
    : defaultTitle;

export const metadata: Metadata = {
  ...home,
  metadataBase,
  title: {
    default: homeTitle,
    template: "%s | Echo",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
};

import { ThemeProvider } from "./components/theme/ThemeProvider";
import JsonLd from "./components/seo/JsonLd";
import {
  organizationJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from "@/lib/geo";

// Static (no headers()) so the root layout doesn't force every route to render dynamically.
const staticSiteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL)?.replace(/\/$/, "");

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('echo_theme_preference');var p=window.matchMedia('(prefers-color-scheme: dark)').matches;var t=(s==='dark'||s==='light')?s:(p?'dark':'light');if(t==='dark'){document.documentElement.classList.add('dark');document.documentElement.classList.remove('light');document.documentElement.setAttribute('data-theme','dark');document.documentElement.style.colorScheme='dark';}else{document.documentElement.classList.add('light');document.documentElement.classList.remove('dark');document.documentElement.setAttribute('data-theme','light');document.documentElement.style.colorScheme='light';}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col transition-colors duration-200">
        <JsonLd data={organizationJsonLd(staticSiteUrl)} />
        <JsonLd data={websiteJsonLd(staticSiteUrl)} />
        <JsonLd data={softwareApplicationJsonLd(staticSiteUrl)} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
