import { SiteHeader } from "@/components/SiteHeader";
import { Footer } from "@/components/Footer";
import { HeroSection } from "@/components/home/HeroSection";
import { HowItWorksSection } from "@/components/home/HowItWorksSection";
import { WhatYouGetSection } from "@/components/home/WhatYouGetSection";

export default async function Home() {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader navLinks sticky wide />

      <HeroSection />
      <HowItWorksSection />
      <WhatYouGetSection />

      <Footer />
    </div>
  );
}
