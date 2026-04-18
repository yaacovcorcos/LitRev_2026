import type { Metadata, Viewport } from "next";
import { Lexend } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";

const lexend = Lexend({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-lexend",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LitRev Dashboard",
  description: "LitRev prototype UI",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const runtime = "nodejs";

const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var t=localStorage.getItem("litrev-theme");if(t==="dark"||t==="light-carbon"||t==="light"){document.documentElement.setAttribute("data-theme",t)}else{document.documentElement.setAttribute("data-theme","light");localStorage.setItem("litrev-theme","light")}}catch(e){document.documentElement.setAttribute("data-theme","light")}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  "use no memo";
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/icon?family=Material+Icons+Round"
        />
        <Script id="litrev-theme-bootstrap" strategy="beforeInteractive">
          {THEME_BOOTSTRAP_SCRIPT}
        </Script>
      </head>
      <body className={`${lexend.className} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
