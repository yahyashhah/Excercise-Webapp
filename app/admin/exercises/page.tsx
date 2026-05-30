import { getAllExercises } from "@/lib/services/admin.service";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dumbbell, Plus, Search, UploadCloud, Pencil, FileSpreadsheet } from "lucide-react";
import Link from "next/link";

interface PageProps {
  searchParams: Promise<{ search?: string; bodyRegion?: string; page?: string }>;
}

const bodyRegionColors: Record<string, string> = {
  LOWER_BODY:  "border-amber-500/30 bg-amber-500/10 text-amber-700",
  UPPER_BODY:  "border-blue-500/30 bg-blue-500/10 text-blue-700",
  CORE:        "border-violet-500/30 bg-violet-500/10 text-violet-700",
  FULL_BODY:   "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  BALANCE:     "border-cyan-500/30 bg-cyan-500/10 text-cyan-700",
  FLEXIBILITY: "border-rose-500/30 bg-rose-500/10 text-rose-700",
};

const bodyRegionLabel: Record<string, string> = {
  LOWER_BODY: "Lower Body", UPPER_BODY: "Upper Body", CORE: "Core",
  FULL_BODY: "Full Body",   BALANCE: "Balance",       FLEXIBILITY: "Flexibility",
};

const phaseLabel: Record<string, string> = {
  WARMUP: "Warm-up", ACTIVATION: "Activation", STRENGTHENING: "Strengthening",
  MOBILITY: "Mobility", COOLDOWN: "Cool-down",
};

const diffLabel: Record<string, string> = {
  BEGINNER: "Beginner", INTERMEDIATE: "Intermediate", ADVANCED: "Advanced",
};

export default async function AdminExercisesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search ?? "";
  const bodyRegion = params.bodyRegion ?? "ALL";
  const page = parseInt(params.page ?? "1", 10);

  const { items: exercises, total, totalPages } = await getAllExercises({ page, pageSize: 25, search, bodyRegion });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Exercise Library</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{total.toLocaleString()} exercises across the platform.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button asChild variant="outline">
            <Link href="/exercises/bulk-import">
              <UploadCloud className="mr-2 h-4 w-4" />
              Bulk Import
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/exercises/import">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Import CSV
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admin/exercises/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Exercise
            </Link>
          </Button>
        </div>
      </div>

      <form method="GET" className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="search" defaultValue={search} placeholder="Search exercises…" className="pl-9" />
        </div>
        <Select name="bodyRegion" defaultValue={bodyRegion}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Body region" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All regions</SelectItem>
            <SelectItem value="LOWER_BODY">Lower Body</SelectItem>
            <SelectItem value="UPPER_BODY">Upper Body</SelectItem>
            <SelectItem value="CORE">Core</SelectItem>
            <SelectItem value="FULL_BODY">Full Body</SelectItem>
            <SelectItem value="BALANCE">Balance</SelectItem>
            <SelectItem value="FLEXIBILITY">Flexibility</SelectItem>
          </SelectContent>
        </Select>
        <button type="submit" className="rounded-xl bg-primary/10 px-4 py-2 text-sm font-medium text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-colors">
          Filter
        </button>
      </form>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Exercise</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Body Region</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden md:table-cell">Phase</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden lg:table-cell">Difficulty</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden xl:table-cell">Created By</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Status</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden lg:table-cell">Added</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {exercises.map((ex) => (
                <tr key={ex.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium text-foreground">{ex.name}</p>
                    {ex.description && (
                      <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">{ex.description}</p>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant="outline" className={`text-[10px] ${bodyRegionColors[ex.bodyRegion] ?? "border-border text-muted-foreground"}`}>
                      {bodyRegionLabel[ex.bodyRegion] ?? ex.bodyRegion}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell">
                    {ex.exercisePhase
                      ? <span className="text-xs text-muted-foreground">{phaseLabel[ex.exercisePhase] ?? ex.exercisePhase}</span>
                      : <span className="text-xs text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-5 py-3 hidden lg:table-cell">
                    <span className="text-xs text-muted-foreground">{diffLabel[ex.difficultyLevel] ?? ex.difficultyLevel}</span>
                  </td>
                  <td className="px-5 py-3 hidden xl:table-cell">
                    {ex.createdBy ? (
                      <div>
                        <p className="text-xs font-medium text-foreground">{ex.createdBy.firstName} {ex.createdBy.lastName}</p>
                        <p className="text-[10px] text-muted-foreground">{ex.createdBy.email}</p>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/60">System</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {ex.isActive
                      ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active</span>
                      : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/60"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" /> Inactive</span>}
                  </td>
                  <td className="px-5 py-3 hidden lg:table-cell">
                    <span className="text-xs text-muted-foreground">{format(new Date(ex.createdAt), "MMM d, yyyy")}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/admin/exercises/${ex.id}/edit`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
              {exercises.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center">
                    <Dumbbell className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No exercises found.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <p className="text-xs text-muted-foreground">Page {page} of {totalPages} · {total.toLocaleString()} exercises</p>
            <div className="flex gap-2">
              {page > 1 && (
                <a href={`?search=${search}&bodyRegion=${bodyRegion}&page=${page - 1}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">← Prev</a>
              )}
              {page < totalPages && (
                <a href={`?search=${search}&bodyRegion=${bodyRegion}&page=${page + 1}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">Next →</a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
