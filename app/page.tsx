import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Brain,
  Activity,
  Users,
  MessageSquare,
  BarChart3,
  TrendingUp,
  ArrowRight,
  Dumbbell,
  Check,
  Star,
  Zap,
  Shield,
  ChevronRight,
} from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "AI Workout Generation",
    description:
      "Generate personalized exercise programs in minutes using Claude AI, tailored to each patient's conditions and goals.",
    gradient: "from-blue-500/10 to-indigo-500/10",
    iconColor: "text-blue-600",
  },
  {
    icon: Dumbbell,
    title: "Exercise Library",
    description:
      "A comprehensive library of rehabilitation exercises with instructions, progressions, and regressions.",
    gradient: "from-teal-500/10 to-cyan-500/10",
    iconColor: "text-teal-600",
  },
  {
    icon: Users,
    title: "Patient Portal",
    description:
      "Patients access their programs, complete guided sessions, and communicate with their clinician.",
    gradient: "from-violet-500/10 to-purple-500/10",
    iconColor: "text-violet-600",
  },
  {
    icon: MessageSquare,
    title: "Feedback System",
    description:
      "Patients rate every exercise. Clinicians get real-time alerts on pain or difficulty reports.",
    gradient: "from-amber-500/10 to-orange-500/10",
    iconColor: "text-amber-600",
  },
  {
    icon: BarChart3,
    title: "Adherence Tracking",
    description:
      "Track workout session completion, exercise compliance, and weekly adherence rates automatically.",
    gradient: "from-emerald-500/10 to-green-500/10",
    iconColor: "text-emerald-600",
  },
  {
    icon: TrendingUp,
    title: "Outcome Monitoring",
    description:
      "Record assessments over time and visualize patient progress with charts and trend analysis.",
    gradient: "from-rose-500/10 to-pink-500/10",
    iconColor: "text-rose-600",
  },
];

const steps = [
  {
    number: "01",
    title: "Create Patient Profile",
    description:
      "Add your patient and capture their health history, limitations, equipment, and goals.",
  },
  {
    number: "02",
    title: "Generate AI Program",
    description:
      "Select focus areas and let Claude AI create a personalized exercise plan in seconds.",
  },
  {
    number: "03",
    title: "Track Progress",
    description:
      "Monitor adherence, review feedback, adjust plans, and track outcomes over time.",
  },
];

const testimonials = [
  {
    name: "Dr. Sarah Chen",
    role: "Physical Therapist",
    quote:
      "RehabAI cut my program creation time from 45 minutes to under 2 minutes. The AI understands contraindications and creates thoughtful progressions.",
    avatar: "SC",
  },
  {
    name: "James Rodriguez",
    role: "Patient",
    quote:
      "Having a guided workout on my phone with clear instructions made me actually stick with my exercises. My therapist can see my progress too.",
    avatar: "JR",
  },
  {
    name: "Dr. Emily Thompson",
    role: "Orthopedic Surgeon",
    quote:
      "I refer patients to clinicians on RehabAI because I can see adherence data and outcomes. It closes the feedback loop beautifully.",
    avatar: "ET",
  },
];

const pricingPlans = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description: "Get started with AI-powered exercise programs",
    features: [
      "1 clinician account",
      "Up to 5 patients",
      "Basic AI generation",
      "Exercise library access",
      "Email support",
    ],
    cta: "Start Free",
    highlighted: false,
  },
  {
    name: "Professional",
    price: "$49",
    period: "/month",
    description: "Everything you need for your practice",
    features: [
      "1 clinician account",
      "Unlimited patients",
      "Full AI generation",
      "Adherence tracking",
      "Messaging system",
      "Outcome monitoring",
      "Priority support",
    ],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Practice",
    price: "$149",
    period: "/month",
    description: "For multi-clinician practices",
    features: [
      "Up to 10 clinicians",
      "Unlimited patients",
      "Full AI generation",
      "All Professional features",
      "Custom branding",
      "API access",
      "Dedicated support",
    ],
    cta: "Contact Sales",
    highlighted: false,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0f172a]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500">
              <Activity className="h-4.5 w-4.5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">RehabAI</span>
          </div>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm text-slate-300 transition-colors hover:text-white">
              Features
            </a>
            <a href="#how-it-works" className="text-sm text-slate-300 transition-colors hover:text-white">
              How it Works
            </a>
            <a href="#pricing" className="text-sm text-slate-300 transition-colors hover:text-white">
              Pricing
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white hover:bg-white/10" asChild>
              <Link href="/sign-in">Sign In</Link>
            </Button>
            <Button size="sm" className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 border-0" asChild>
              <Link href="/sign-up">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0f172a] via-[#1e3a5f] to-[#0c4a6e] py-24 sm:py-36">
        {/* Background decoration */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/5 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Badge className="mb-6 border-blue-400/30 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-200 hover:bg-blue-500/20">
              <Zap className="mr-1.5 h-3.5 w-3.5" />
              AI-Powered Rehabilitation
            </Badge>
            <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl">
              Home Exercise Programs That{" "}
              <span className="bg-gradient-to-r from-blue-300 via-cyan-300 to-teal-300 bg-clip-text text-transparent">
                Actually Work
              </span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-slate-300 sm:text-xl">
              Clinicians generate personalized rehabilitation programs in under 2 minutes. Patients
              get guided workouts with progress tracking. Everyone wins.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="lg" className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 border-0 px-8 h-12 text-base" asChild>
                <Link href="/sign-up">
                  Start Free Trial <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="border-slate-500 text-slate-200 bg-transparent hover:bg-white/10 hover:text-white h-12 px-8 text-base" asChild>
                <Link href="/sign-in">Sign In</Link>
              </Button>
            </div>

            {/* Trust badges */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-sm text-slate-400">
              <div className="flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-emerald-400" />
                HIPAA Compliant
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-emerald-400" />
                No credit card required
              </div>
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-emerald-400" />
                500+ clinicians
              </div>
            </div>
          </div>

          {/* Dashboard mockup */}
          <div className="mx-auto mt-20 max-w-4xl">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-1.5 shadow-2xl backdrop-blur-sm">
              <div className="rounded-xl bg-white p-6 shadow-inner">
                <div className="mb-5 flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  <div className="h-3 w-3 rounded-full bg-amber-400" />
                  <div className="h-3 w-3 rounded-full bg-green-400" />
                  <div className="ml-4 h-5 w-48 rounded bg-slate-100" />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
                    <p className="text-sm font-medium text-blue-600">Active Patients</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">127</p>
                    <p className="mt-1 text-xs text-emerald-600">+12 this week</p>
                  </div>
                  <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 p-6">
                    <p className="text-sm font-medium text-emerald-600">Plans Generated</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">342</p>
                    <p className="mt-1 text-xs text-emerald-600">+28 this week</p>
                  </div>
                  <div className="rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 p-6">
                    <p className="text-sm font-medium text-violet-600">Adherence Rate</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">94%</p>
                    <p className="mt-1 text-xs text-emerald-600">+3% vs last month</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-slate-200 bg-white py-14">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 sm:grid-cols-4 sm:px-6 lg:px-8">
          {[
            { value: "500+", label: "Clinicians" },
            { value: "10,000+", label: "Patients" },
            { value: "95%", label: "Adherence Rate" },
            { value: "2 min", label: "Program Generation" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-3xl font-extrabold text-slate-900 sm:text-4xl">{stat.value}</p>
              <p className="mt-1 text-sm font-medium text-slate-500">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Badge className="mb-4 bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200">Platform Features</Badge>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Everything you need for rehabilitation
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              A complete platform for creating, assigning, and monitoring home exercise programs.
            </p>
          </div>
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title} className="group border-slate-200 transition-all hover:shadow-lg hover:border-slate-300 hover:-translate-y-0.5">
                  <CardContent className="p-6">
                    <div className={`mb-4 inline-flex rounded-xl bg-gradient-to-br ${feature.gradient} p-3`}>
                      <Icon className={`h-6 w-6 ${feature.iconColor}`} />
                    </div>
                    <h3 className="mb-2 text-lg font-semibold text-slate-900">{feature.title}</h3>
                    <p className="text-sm leading-relaxed text-slate-600">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-gradient-to-b from-slate-50 to-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Badge className="mb-4 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200">Simple Process</Badge>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              How it works
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Three simple steps to transform patient care.
            </p>
          </div>
          <div className="mt-16 grid gap-8 lg:grid-cols-3">
            {steps.map((step, idx) => (
              <div key={step.number} className="relative rounded-2xl bg-white p-8 shadow-sm border border-slate-100 transition-all hover:shadow-md">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-lg font-bold text-white">
                  {step.number}
                </div>
                <h3 className="mt-4 text-xl font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-2 text-slate-600">{step.description}</p>
                {idx < steps.length - 1 && (
                  <ChevronRight className="absolute -right-4 top-1/2 hidden h-8 w-8 -translate-y-1/2 text-slate-300 lg:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Badge className="mb-4 bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200">Testimonials</Badge>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Trusted by healthcare professionals
            </h2>
          </div>
          <div className="mt-16 grid gap-8 lg:grid-cols-3">
            {testimonials.map((t) => (
              <Card key={t.name} className="border-slate-200 transition-all hover:shadow-lg">
                <CardContent className="p-6">
                  <div className="mb-4 flex gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="mb-6 text-sm leading-relaxed text-slate-600">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-sm font-semibold text-white">
                      {t.avatar}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                      <p className="text-xs text-slate-500">{t.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-gradient-to-b from-slate-50 to-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Badge className="mb-4 bg-violet-50 text-violet-700 hover:bg-violet-100 border-violet-200">Pricing</Badge>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-lg text-slate-600">Start free, upgrade when you are ready.</p>
          </div>
          <div className="mt-16 grid gap-8 lg:grid-cols-3">
            {pricingPlans.map((plan) => (
              <Card
                key={plan.name}
                className={`relative transition-all hover:shadow-lg ${
                  plan.highlighted
                    ? "border-blue-500 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500 scale-[1.02]"
                    : "border-slate-200"
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white border-0 shadow-md">Most Popular</Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <div className="mt-2">
                    <span className="text-4xl font-extrabold text-slate-900">{plan.price}</span>
                    {plan.period && <span className="text-slate-500">{plan.period}</span>}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{plan.description}</p>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2.5 text-sm text-slate-600">
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                          <Check className="h-3 w-3 text-emerald-600" />
                        </div>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className={`mt-6 w-full ${
                      plan.highlighted
                        ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 border-0"
                        : ""
                    }`}
                    variant={plan.highlighted ? "default" : "outline"}
                    asChild
                  >
                    <Link href="/sign-up">{plan.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="bg-gradient-to-r from-[#0f172a] via-[#1e3a5f] to-[#0c4a6e] py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
            Ready to transform patient care?
          </h2>
          <p className="mt-4 text-lg text-blue-200">
            Join hundreds of clinicians using AI to create better exercise programs.
          </p>
          <Button size="lg" className="mt-8 bg-white text-slate-900 hover:bg-slate-100 border-0 px-8 h-12 text-base font-semibold" asChild>
            <Link href="/sign-up">
              Get Started for Free <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-slate-50 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500">
                  <Activity className="h-4 w-4 text-white" />
                </div>
                <span className="text-lg font-bold text-slate-900">RehabAI</span>
              </div>
              <p className="mt-3 text-sm text-slate-600">
                AI-powered home exercise programs for modern rehabilitation.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Product</h3>
              <ul className="mt-3 space-y-2">
                <li>
                  <a href="#features" className="text-sm text-slate-600 transition-colors hover:text-slate-900">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="text-sm text-slate-600 transition-colors hover:text-slate-900">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="text-sm text-slate-600 transition-colors hover:text-slate-900">
                    How it Works
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Company</h3>
              <ul className="mt-3 space-y-2">
                <li>
                  <a href="#" className="text-sm text-slate-600 transition-colors hover:text-slate-900">About</a>
                </li>
                <li>
                  <a href="#" className="text-sm text-slate-600 transition-colors hover:text-slate-900">Blog</a>
                </li>
                <li>
                  <a href="#" className="text-sm text-slate-600 transition-colors hover:text-slate-900">Careers</a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Legal</h3>
              <ul className="mt-3 space-y-2">
                <li>
                  <a href="#" className="text-sm text-slate-600 transition-colors hover:text-slate-900">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="#" className="text-sm text-slate-600 transition-colors hover:text-slate-900">
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a href="#" className="text-sm text-slate-600 transition-colors hover:text-slate-900">
                    HIPAA Compliance
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 border-t border-slate-200 pt-8">
            <p className="text-center text-sm text-slate-500">
              &copy; {new Date().getFullYear()} RehabAI. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
