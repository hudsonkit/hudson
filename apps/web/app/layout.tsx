import type { Metadata, Viewport } from "next";
import {
  JetBrains_Mono,
  Jura,
  Geist,
  Geist_Mono,
  Space_Grotesk,
  Newsreader,
  Bodoni_Moda,
  Spectral,
  Cormorant_Garamond,
  IBM_Plex_Sans,
  IBM_Plex_Mono,
} from "next/font/google";
import Script from "next/script";
import { SITE_ORIGIN, GOOGLE_TAG_URL, analyticsInitScript } from "../site/seo";
import { HudsonThemeClient } from "./HudsonThemeClient";
import {
  PAPERS,
  ACCENTS,
  DISPLAY_FONTS,
  BODY_FONTS,
  MONO_FONTS,
  STUDIO_COOKIE,
} from "@/marketing/theme/defaults";
import "./globals.css";
import "@/marketing/styles/site.css";

// ─── Workspace + embed fonts (Hudson product) ────────────────────────────────
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});
const jura = Jura({
  variable: "--font-jura",
  subsets: ["latin"],
  display: "swap",
});

// ─── Marketing fonts (Studio Console picker exposes these) ───────────────────
const geist = Geist({ subsets: ["latin"], display: "swap", variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], display: "swap", variable: "--font-geist-mono" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-grotesk",
});
const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-newsreader",
  style: ["normal", "italic"],
  axes: ["opsz"],
});
const bodoniModa = Bodoni_Moda({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bodoni-moda",
  style: ["normal", "italic"],
});
const spectral = Spectral({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-spectral",
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
});
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-cormorant",
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
});
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plex-sans",
  weight: ["300", "400", "500", "600", "700"],
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
});

const fontVars = [
  jetbrainsMono.variable,
  jura.variable,
  geist.variable,
  geistMono.variable,
  spaceGrotesk.variable,
  newsreader.variable,
  bodoniModa.variable,
  spectral.variable,
  cormorant.variable,
  plexSans.variable,
  plexMono.variable,
].join(" ");

// ─── Hudson workspace theme bootstrap ────────────────────────────────────────
function getHudsonThemeScript(storageKey = "hudson.settings") {
  return `!function(k){try{var d=document.documentElement,q=new URLSearchParams(location.search),s=JSON.parse(localStorage.getItem(k)||'{}'),x=q.get('theme')||s.theme||'system',y=q.get('template')||s.template||'hudson',m='system'===x&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'system'===x?'light':x;d.dataset.hudsonTheme=m,d.dataset.hudsonTemplate=y}catch(e){var d=document.documentElement;d.dataset.hudsonTheme='dark';d.dataset.hudsonTemplate='hudson'}}('${storageKey.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}');`;
}

// ─── Studio (marketing) theme bootstrap ──────────────────────────────────────
// Reads the studio cookie and inlines a high-specificity <style> for the
// .hudson-site root before first paint, so saved paper/accent/font choices
// survive page navigation without a flash.
const themeLookups = JSON.stringify({
  paper: Object.fromEntries(PAPERS.map((p) => [p.id, p.vars])),
  accent: Object.fromEntries(ACCENTS.map((a) => [a.id, a.vars])),
  display: Object.fromEntries(DISPLAY_FONTS.map((f) => [f.id, f.cssValue])),
  body: Object.fromEntries(BODY_FONTS.map((f) => [f.id, f.cssValue])),
  mono: Object.fromEntries(MONO_FONTS.map((f) => [f.id, f.cssValue])),
});

const studioBootScript = `(function(){try{
var m=document.cookie.match(/${STUDIO_COOKIE}=([^;]+)/);if(!m)return;
var s=JSON.parse(decodeURIComponent(m[1]));
var L=${themeLookups};
var P=L.paper[s.paper],A=L.accent[s.accent];if(!P||!A)return;
var r=Object.assign({},P,A);
if(L.display[s.display])r['--font-display']=L.display[s.display];
if(L.body[s.body])r['--font-body']=L.body[s.body];
if(L.mono[s.mono])r['--font-mono']=L.mono[s.mono];
if(typeof s.bodyWeight==='number')r['--font-weight-body']=String(s.bodyWeight);
if(typeof s.gridMinor==='number')r['--grid-opacity-minor']=String(s.gridMinor);
if(typeof s.gridMajor==='number')r['--grid-opacity-major']=String(s.gridMajor);
if(typeof s.strokeW==='number')r['--stroke-w']=s.strokeW+'px';
if(typeof s.radiusUI==='number')r['--radius-ui']=s.radiusUI+'px';
if(typeof s.radiusCard==='number')r['--radius-card']=s.radiusCard+'px';
var c='';for(var k in r)c+=k+':'+r[k]+' !important;';
var st=document.createElement('style');st.id='hudson-theme-boot';
st.textContent='html .hudson-site{'+c+'}';
document.head.appendChild(st);
var attrSet=function(){var n=document.querySelector('.hudson-site');if(n)n.setAttribute('data-paper',s.paper);};
if(document.readyState!=='loading')attrSet();
else document.addEventListener('DOMContentLoaded',attrSet);
}catch(e){}})();`;

// viewport-fit=cover lets the page paint into the iPhone safe-area regions
// (notch, Dynamic Island, home indicator). All marketing surfaces consume
// env(safe-area-inset-*) where it matters (sticky sheet header, fixed
// studio console). Workspace and embed surfaces benefit too — this is the
// shared root layout.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: "HudsonKit — Hudson gives apps a shared workspace",
  description:
    "A spatial canvas for your apps on iOS, macOS, and the web. The same primitives everywhere: a terminal, commands, and actions your agents can run.",
  openGraph: {
    title: "HudsonKit — Hudson gives apps a shared workspace",
    description:
      "A spatial canvas for your apps on iOS, macOS, and the web. The same primitives everywhere: a terminal, commands, and actions your agents can run.",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "HudsonKit — Hudson gives apps a shared workspace",
    description:
      "A spatial canvas for your apps on iOS, macOS, and the web. The same primitives everywhere: a terminal, commands, and actions your agents can run.",
    images: ["/og.png"],
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
      suppressHydrationWarning
      className={fontVars}
      data-hudson-template="hudson"
      data-hudson-theme="dark"
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: getHudsonThemeScript() }} />
        <script dangerouslySetInnerHTML={{ __html: studioBootScript }} />
        <Script
          src={GOOGLE_TAG_URL}
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {analyticsInitScript()}
        </Script>
      </head>
      <body className="antialiased" style={{ margin: 0 }}>
        <HudsonThemeClient>{children}</HudsonThemeClient>
      </body>
    </html>
  );
}
