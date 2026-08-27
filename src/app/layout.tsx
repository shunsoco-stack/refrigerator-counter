import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { APP_DESCRIPTION, APP_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${APP_NAME} — 開けた回数だけ、真剣に。`,
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  alternates: { canonical: "/" },
  openGraph: { title: APP_NAME, description: APP_DESCRIPTION, url: "/", siteName: APP_NAME, locale: "ja_JP", type: "website" },
  twitter: { card: "summary_large_image", title: APP_NAME, description: APP_DESCRIPTION },
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f6f7" },
    { media: "(prefers-color-scheme: dark)", color: "#111b22" },
  ],
};

// Static, trusted code. The version-matched Next.js guide recommends a
// synchronous head script for a saved theme to apply before the first paint.
const themeScript = `(function(){try{var t=localStorage.getItem('refrigerator-counter:theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head><script id="theme-before-paint" dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        {children}
        <ServiceWorkerRegistration />
        <Analytics debug={false} />
      </body>
    </html>
  );
}
