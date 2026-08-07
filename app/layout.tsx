import type { Metadata } from "next";
import { Frank_Ruhl_Libre, IBM_Plex_Sans, IBM_Plex_Sans_Hebrew, IBM_Plex_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import AssistantWidgetMount from "@/components/AssistantWidgetMount";
import { ToastProvider } from "@/components/ui/Toast";
import { getSiteContent } from "@/lib/siteContent";
import { SITE_NAME, SITE_URL } from "@/lib/siteUrl";
import "./globals.css";

// Display/headings/wordmark (§3) -- one family covers both scripts, so a Hebrew
// program name never falls back to a mismatched second face mid-heading.
const frankRuhlLibre = Frank_Ruhl_Libre({
  variable: "--font-frank-ruhl-libre",
  subsets: ["latin", "hebrew"],
  weight: ["400", "500", "700"],
});

// Body/UI text. IBM Plex Sans itself ships no Hebrew subset on Google Fonts --
// IBM_Plex_Sans_Hebrew is loaded alongside it and both variables sit in the same
// --font-sans stack (see globals.css) so Hebrew glyphs in body copy render in the
// matching Plex face instead of a system fallback.
const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const ibmPlexSansHebrew = IBM_Plex_Sans_Hebrew({
  variable: "--font-ibm-plex-sans-hebrew",
  subsets: ["hebrew"],
  weight: ["400", "500", "600"],
});

// Numerals/metadata strips/response counts. No Hebrew subset exists for this
// family; stray Hebrew text set in font-mono falls through to the Sans Hebrew/
// serif stack in globals.css's --font-mono fallback chain.
const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const SITE_DESCRIPTION =
  "A community-driven guide to Jewish Israel programs — gap years, summer trips, internships, and more.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image" },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Everyone sees the assistant widget once an admin flips assistantEnabled on
  // via /admin/settings (see AssistantSettingsForm). Read here (not per-page) so
  // every route gets a consistent answer from one check; the admin-always-sees-it
  // override is resolved client-side inside AssistantWidgetMount (via Clerk's
  // cached user object) instead of here, so this layout -- and every page it
  // wraps -- doesn't need a server-side auth call just for that override.
  const assistantEnabled = await getSiteContent("assistantEnabled");

  return (
    <ClerkProvider>
      <html
        lang="en"
        suppressHydrationWarning
        className={`${frankRuhlLibre.variable} ${ibmPlexSans.variable} ${ibmPlexSansHebrew.variable} ${ibmPlexMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col bg-background text-foreground">
          <ToastProvider>
            <Nav />
            <main className="flex flex-1 flex-col overflow-x-clip">{children}</main>
            <Footer />
            <AssistantWidgetMount enabledSiteWide={assistantEnabled === "true"} />
          </ToastProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
