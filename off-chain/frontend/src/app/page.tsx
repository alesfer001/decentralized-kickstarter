import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { TrustMatrix } from "@/components/landing/TrustMatrix";
import { CreatorsBand } from "@/components/landing/CreatorsBand";
import { Roadmap } from "@/components/landing/Roadmap";
import { Faq } from "@/components/landing/Faq";

/**
 * Landing page: explains CrowdCell. The product itself (campaigns, pledging, wallet) lives at /app.
 */
export default function Landing() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <TrustMatrix />
      <CreatorsBand />
      <Roadmap />
      <Faq />
    </>
  );
}
