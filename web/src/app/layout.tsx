import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { MainNav } from "@/components/main-nav";
import { getCurrentUser } from "@/lib/auth";
import { MobileNav } from "@/components/mobile-nav";

import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"

import { prisma } from "@/lib/db";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "租赁管理后台",
  description: "Internal ERP for Rental",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser()
  const config = await prisma.appConfig.findUnique({ where: { key: "system_name" } })
  const systemName = config?.value || "米奇租赁erp"

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${inter.className} h-screen overflow-hidden`}>
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <div className="flex h-screen overflow-hidden">
              {user && (
                <aside className="hidden md:flex">
                  <MainNav user={user} systemName={systemName} />
                </aside>
              )}
              <main className="flex-1 overflow-y-auto p-4 sm:p-8 bg-background">
                {user && (
                  <div className="md:hidden mb-4 flex items-center">
                    <MobileNav user={user} systemName={systemName} />
                  </div>
                )}
                {children}
              </main>
            </div>
            <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
