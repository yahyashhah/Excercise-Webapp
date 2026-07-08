import Link from "next/link";
import { Activity, Shield } from "lucide-react";

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Pricing", href: "/#pricing" },
      { label: "How it Works", href: "/#how-it-works" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Blog", href: "#" },
      { label: "Careers", href: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "#" },
      { label: "Terms of Service", href: "#" },
      { label: "HIPAA Compliance", href: "#" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-5">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-blue-500 to-indigo-500 shadow-md shadow-blue-500/20">
                <Activity className="h-4 w-4 text-white" />
              </div>
              <span className="text-lg font-bold text-slate-900">INMOTUS RX</span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-500">
              AI-powered home exercise programs for modern rehabilitation. Built for trainers, designed for clients.
            </p>
            <div className="mt-6 flex items-center gap-1.5 text-xs text-slate-400">
              <Shield className="h-3.5 w-3.5 text-emerald-500" />
              HIPAA Compliant · SOC 2 Type II
            </div>
          </div>

          {/* Links */}
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-slate-900">{col.title}</h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-slate-500 transition-colors hover:text-slate-900"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-slate-100 pt-8 sm:flex-row">
          <p className="text-sm text-slate-400">
            &copy; {new Date().getFullYear()} INMOTUS RX. All rights reserved.
          </p>
          <p className="text-xs text-slate-400">
            Made with ♥ for better rehabilitation outcomes
          </p>
        </div>
      </div>
    </footer>
  );
}
