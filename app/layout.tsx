import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Disclaimer from "@/components/Disclaimer";
import AssistantWidgetMount from "@/components/AssistantWidgetMount";
import { ToastProvider } from "@/components/ui/Toast";
import { getCurrentRole } from "@/lib/roles";
import { getSiteContent } from "@/lib/siteContent";
import { SITE_NAME, SITE_URL } from "@/lib/siteUrl";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
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
  // Admins always see the assistant widget; everyone else only once an admin
  // flips assistantEnabled on via /admin/settings (see AssistantSettingsForm).
  // Read here (not per-page) so every route gets a consistent answer from one
  // server-side check; AssistantWidgetMount only adds the client-side path hiding
  // (admin/auth routes) on top.
  const [role, assistantEnabled] = await Promise.all([getCurrentRole(), getSiteContent("assistantEnabled")]);
  const showAssistant = role === "admin" || assistantEnabled === "true";

  return (
    <ClerkProvider>
      <html
        lang="en"
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col bg-background text-foreground">
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`,
            }}
          />
          <ToastProvider>
            <Nav />
            <div className="flex flex-1 flex-col overflow-x-clip">{children}</div>
            <Footer />
            <Disclaimer />
            <AssistantWidgetMount show={showAssistant} />
          </ToastProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
