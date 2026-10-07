import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { BootCheck } from "@/components/layout/boot-check";
import { ServiceWorkerRegister } from "@/components/layout/service-worker";
import { AppLaunch } from "@/components/layout/app-launch";
import { KeyboardInsetSync } from "@/components/layout/keyboard-sync";
import { DataProvider } from "@/data/provider";
import { Toaster } from "@/components/ui/sonner";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { STARTUP_IMAGES } from "@/lib/startup-images";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  // Nenhuma tela usa fonte monoespaçada hoje: sem isto ela era baixada em toda página à toa.
  preload: false,
});

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_TAGLINE,
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "default",
    startupImage: STARTUP_IMAGES.map(({ id, media }) => ({ url: `/startup/${id}`, media })),
  },
  formatDetection: { telephone: false },
  // App pessoal: nunca deve aparecer em buscadores.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // ocupa a tela toda no iPhone; as áreas seguras são tratadas com env(safe-area-inset-*)
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f7ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0a120e" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <noscript>
          <style>{`.launch-screen, .app-content { display: none !important; }`}</style>
          <p style={{ margin: 0, padding: 16, textAlign: "center" }}>
            Este app precisa de JavaScript para mostrar seus dados.
          </p>
        </noscript>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <DataProvider>
            <AppLaunch>
              {children}
              <Toaster position="top-center" />
            </AppLaunch>
          </DataProvider>
        </ThemeProvider>
        <ServiceWorkerRegister />
        <KeyboardInsetSync />
        <BootCheck />
      </body>
    </html>
  );
}
