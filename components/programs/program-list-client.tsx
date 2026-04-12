"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  MoreVertical,
  Copy,
  UserPlus,
  Archive,
  Sparkles,
  Library,
  Pencil,
  Users,
  Dumbbell,
} from "lucide-react";
import { toast } from "sonner";
import {
  duplicateProgramAction,
  deleteProgramAction,
} from "@/actions/program-actions";
import { formatDistanceToNow } from "date-fns";

interface ProgramListItem {
  id: string;
  name: string;
  status: string;
  isTemplate: boolean;
  tags: string[];
  updatedAt: Date;
  patientId?: string | null;
  clinician: { id: string; firstName: string; lastName: string };
  patient: { id: string; firstName: string; lastName: string } | null;
  _count: { workouts: number };
}

const statusConfig: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-slate-100 text-slate-600 border-slate-200" },
  ACTIVE: { label: "Active", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  PAUSED: { label: "Paused", className: "bg-amber-100 text-amber-700 border-amber-200" },
  COMPLETED: { label: "Completed", className: "bg-blue-100 text-blue-700 border-blue-200" },
  ARCHIVED: { label: "Archived", className: "bg-red-100 text-red-600 border-red-200" },
};

// Deterministic gradient for each program based on its name
const programGradients = [
  "from-blue-500 to-indigo-600",
  "from-violet-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-cyan-500 to-blue-600",
];

function getProgramGradient(name: string) {
  const idx = name.charCodeAt(0) % programGradients.length;
  return programGradients[idx];
}

export function ProgramListClient({
  programs,
  role,
}: {
  programs: ProgramListItem[];
  role?: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [templateOnly, setTemplateOnly] = useState(false);

  const filtered = programs.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (templateOnly && !p.isTemplate) return false;
    return true;
  });

  async function handleDuplicate(id: string) {
    const result = await duplicateProgramAction(id);
    if (result.success) {
      toast.success("Program duplicated");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleArchive(id: string) {
    const result = await deleteProgramAction(id);
    if (result.success) {
      toast.success("Program archived");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search programs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="PAUSED">Paused</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 cursor-pointer">
            <Switch checked={templateOnly} onCheckedChange={setTemplateOnly} />
            <span className="text-sm text-muted-foreground whitespace-nowrap">Templates only</span>
          </label>
        </div>

        {role === "CLINICIAN" && (
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" className="gap-2" asChild>
              <Link href="/programs/generate">
                <Sparkles className="h-4 w-4 text-blue-600" />
                AI Generate
              </Link>
            </Button>
            <Button className="gap-2 bg-linear-to-r from-blue-500 to-indigo-500 border-0 text-white shadow-md shadow-blue-500/20 hover:from-blue-600 hover:to-indigo-600" asChild>
              <Link href="/programs/new">
                <Plus className="h-4 w-4" />
                New Program
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Library className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <h3 className="mt-4 font-semibold">No programs found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {role === "CLINICIAN"
              ? "Generate an AI program or create one manually to get started."
              : "No programs have been assigned to you yet."}
          </p>
          {role === "CLINICIAN" && (
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/programs/generate">
                  <Sparkles className="mr-1.5 h-3.5 w-3.5 text-blue-600" />
                  Generate with AI
                </Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/programs/new">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  New Program
                </Link>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((program) => {
            const status = statusConfig[program.status] ?? { label: program.status, className: "bg-muted text-muted-foreground border-border" };

            return (
              <Card
                key={program.id}
                className="group flex flex-col border-0 shadow-sm ring-1 ring-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-border"
              >
                <CardContent className="flex flex-1 flex-col p-5">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/programs/${program.id}`} className="flex-1 min-w-0">
                      <h3 className="truncate text-base font-semibold leading-tight transition-colors group-hover:text-primary">
                        {program.name}
                      </h3>
                    </Link>
                    {role === "CLINICIAN" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="shrink-0 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100">
                          <MoreVertical className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => router.push(`/programs/${program.id}/edit`)}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(program.id)}>
                            <Copy className="mr-2 h-4 w-4" /> Duplicate
                          </DropdownMenuItem>
                          {!program.patientId && (
                            <DropdownMenuItem onClick={() => router.push(`/programs/${program.id}?assign=true`)}>
                              <UserPlus className="mr-2 h-4 w-4" /> Assign Client
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleArchive(program.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Archive className="mr-2 h-4 w-4" /> Archive
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  {/* Badges */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Badge
                      className={`border text-[11px] font-medium ${status.className}`}
                    >
                      {status.label}
                    </Badge>
                    {program.isTemplate && (
                      <Badge variant="outline" className="text-[11px] font-medium">
                        Template
                      </Badge>
                    )}
                  </div>

                  {/* Meta */}
                  <div className="mt-4 flex-1 space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {program.patient
                          ? `${program.patient.firstName} ${program.patient.lastName}`
                          : "Unassigned"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Dumbbell className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {program._count.workouts} workout{program._count.workouts !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-4 border-t border-border/60 pt-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-muted-foreground/60">
                        Updated{" "}
                        {formatDistanceToNow(new Date(program.updatedAt), { addSuffix: true })}
                      </p>
                      <Link
                        href={`/programs/${program.id}`}
                        className="text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        View →
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
