import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import Hero from "@/components/landing/hero";
import MentorDemo from "@/components/landing/mentor-demo";
import HowItWorks from "@/components/landing/how-it-works";
import WhyOnlearn from "@/components/landing/why-onlearn";
import Faq from "@/components/landing/faq";
import ClosingCta from "@/components/landing/closing-cta";
import SiteFooter from "@/components/landing/footer";
import LearningHome from "@/components/learning-home";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Onlearn - Brilliant for engineers, with a real AI mentor",
  description:
    "Build a daily habit of solving real DSA and Data Science problems with a Socratic AI mentor. 440 DSA and 631 Data Science problems, in-browser code execution, and progress that compounds. Free to start.",
};

export default async function HomePage() {
  const user = await getCurrentUser();

  if (user) {
    return <LearningHome user={user} />;
  }

  return (
    <>
      <main className="flex-1">
        <Hero />
        <MentorDemo />
        <HowItWorks />
        <WhyOnlearn />
        <Faq />
        <ClosingCta />
      </main>
      <SiteFooter />
    </>
  );
}
