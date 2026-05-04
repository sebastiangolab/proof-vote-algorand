import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/WalletProvider";
import { TestnetBanner } from "@/components/TestnetBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ProofVote — Voting on Algorand Blockchain",
  description:
    "Decentralised polling where every vote is backed by a refundable ALGO stake. One wallet, one vote.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning on <html> and <body> prevents React hydration
    // mismatches caused by browser extensions (e.g. Grammarly, wallet providers)
    // injecting attributes that were not present during SSR
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
        <TestnetBanner />
        
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
