import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { MainNav } from "@/components/main-nav";
import { getCurrentUser } from "@/lib/auth";

import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "米奇租赁管理后台",
  description: "Internal ERP for Miqi Rental",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser()

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <div className="flex h-screen overflow-hidden">
              {user && (
                <aside className="hidden md:flex">
                  <MainNav user={user} />
                </aside>
              )}
              <main className="flex-1 overflow-y-auto p-8 bg-background">
                {children}
              </main>
            </div>
            <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
