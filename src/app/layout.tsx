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

const defaultTitle = "Echo — The AI Workspace That Thinks With You";
const defaultDescription =
  "Echo is an AI workspace that helps you think, organize ideas, analyze information, and turn conversations into a visual workspace.";

// Home is a client page, so its title lives here as `title.default`.
// An override replaces that default only; the "%s | Echo" template stays for other routes.
const home = withSeo("/", {
  title: { absolute: defaultTitle },
  description: defaultDescription,
  openGraph: {
    title: defaultTitle,
    description: defaultDescription,
    type: "website",
  },
});

const homeTitle =
  home.title && typeof home.title === "object" && "absolute" in home.title && home.title.absolute
    ? home.title.absolute
    : defaultTitle;

export const metadata: Metadata = {
  ...home,
  title: {
    default: homeTitle,
    template: "%s | Echo",
  },
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
