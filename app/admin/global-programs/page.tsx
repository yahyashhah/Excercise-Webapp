import { requireSuperAdmin } from "@/lib/current-user";
import { getAdminGlobalPrograms } from "@/lib/services/admin.service";
import { format } from "date-fns";
import { Globe, Plus, Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { GlobalProgramActions } from "./global-program-actions";

interface PageProps {
  searchParams: Promise<{ search?: string; page?: string }>;
}

export default async function AdminGlobalProgramsPage({ searchParams }: PageProps) {
  await requireSuperAdmin();
  const params = await searchParams;
  const search = params.search ?? "";
  const page = parseInt(params.page ?? "1", 10);

  const { items: programs, total, totalPages } = await getAdminGlobalPrograms({
    page,
    pageSize: 25,
    search,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Global Programs</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {total.toLocaleString()} master program{total !== 1 ? "s" : ""} available to all organizations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/global-programs/generate"
            className="flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-2 text-sm font-medium text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            Generate with AI
          </Link>
          <Link
            href="/admin/global-programs/new"
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Program
          </Link>
        </div>
      </div>

      <form method="GET" className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="search" defaultValue={search} placeholder="Search global programs…" className="pl-9" />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-primary/10 px-4 py-2 text-sm font-medium text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-colors"
        >
          Search
        </button>
      </form>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Program</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden md:table-cell">Workouts</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden lg:table-cell">Last Pushed</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Created</th>
                <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {programs.map((prog) => (
                <tr key={prog.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium text-foreground">{prog.name}</p>
                    {prog.description && (
                      <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">{prog.description}</p>
                    )}
                    {prog.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {prog.tags.slice(0, 4).map((tag) => (
                          <span key={tag} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{tag}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell">
                    <span className="text-xs text-muted-foreground">{prog._count.workouts}</span>
                  </td>
                  <td className="px-5 py-3 hidden lg:table-cell">
                    <span className="text-xs text-muted-foreground">
                      {prog.globalUpdatedAt
                        ? format(new Date(prog.globalUpdatedAt), "MMM d, yyyy")
                        : "—"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {format(new Date(prog.createdAt), "MMM d, yyyy")}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <GlobalProgramActions programId={prog.id} programName={prog.name} />
                  </td>
                </tr>
              ))}
              {programs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center">
                    <Globe className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No global programs yet.</p>
                    <Link href="/admin/global-programs/new" className="mt-2 inline-block text-sm text-primary hover:underline">
                      Create the first one →
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <p className="text-xs text-muted-foreground">Page {page} of {totalPages} · {total.toLocaleString()} programs</p>
            <div className="flex gap-2">
              {page > 1 && (
                <a href={`?search=${search}&page=${page - 1}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">← Prev</a>
              )}
              {page < totalPages && (
                <a href={`?search=${search}&page=${page + 1}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">Next →</a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
