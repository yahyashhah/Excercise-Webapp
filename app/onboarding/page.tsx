import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { Activity } from "lucide-react";

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // If already onboarded, redirect to dashboard
  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (user?.onboarded) redirect("/dashboard");

  return (
    <div className="flex min-h-screen">
      {/* Left branding panel */}
      <div className="hidden w-1/2 flex-col justify-between bg-gradient-to-br from-[#0f172a] via-[#1e3a5f] to-[#0c4a6e] p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white">INMOTUS RX</span>
        </div>
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white">
            AI-powered exercise programs for modern rehabilitation.
          </h1>
          <p className="mt-4 max-w-md text-lg text-slate-300">
            Create personalized programs in minutes, track patient adherence, and
            monitor outcomes -- all in one platform.
          </p>
        </div>
        <p className="text-sm text-slate-400">&copy; {new Date().getFullYear()} INMOTUS RX. All rights reserved.</p>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 flex-col items-center justify-center bg-[oklch(0.97_0.005_247)] p-6 sm:p-12">
        <div className="flex items-center gap-2.5 mb-8 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold">INMOTUS RX</span>
        </div>
        <div className="w-full max-w-lg">
          <OnboardingForm />
        </div>
      </div>
    </div>
  );
}
