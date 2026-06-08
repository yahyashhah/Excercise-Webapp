"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Upload,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import {
  duplicateProgramAction,
  deleteProgramAction,
  copyGlobalProgramAction,
} from "@/actions/program-actions";
import { formatDistanceToNow } from "date-fns";

interface ProgramListItem {
  id: string;
  name: string;
  status: string;
  isTemplate: boolean;
  isGlobal: boolean;
  sourceTemplateId?: string | null;
  tags: string[];
  updatedAt: Date;
  createdAt: Date;
  patientId?: string | null;
  clinician: { id: string; firstName: string; lastName: string } | null;
  patient: { id: string; firstName: string; lastName: string } | null;
  _count: { workouts: number };
}

interface GlobalProgramItem {
  id: string;
  name: string;
  description?: string | null;
  tags: string[];
  globalUpdatedAt?: Date | null;
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
  globalPrograms = [],
  updatableIds = [],
  role,
}: {
  programs: ProgramListItem[];
  globalPrograms?: GlobalProgramItem[];
  updatableIds?: string[];
  role?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const updatableSet = new Set(updatableIds);
  const [copying, setCopying] = useState<string | null>(null);

  const activeTab =
    role === "CLINICIAN"
      ? searchParams.get("tab") === "templates"
        ? "templates"
        : searchParams.get("tab") === "library"
        ? "library"
        : "programs"
      : "programs";

  function handleTabChange(nextTab: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextTab === "programs") {
      params.delete("tab");
    } else {
      params.set("tab", nextTab);
    }
    const nextQuery = params.toString();
    router.push(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }

  const filtered = programs.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
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

  async function handleCopyGlobal(globalProgramId: string, name: string) {
    setCopying(globalProgramId);
    try {
      const result = await copyGlobalProgramAction(globalProgramId);
      if (result.success) {
        toast.success(`"${name}" copied to your library`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setCopying(null);
    }
  }

  return (
    <div className="space-y-6">
      {role === "CLINICIAN" && (
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="programs">Programs</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="library">
              Template Library
              {globalPrograms.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  {globalPrograms.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      {/* Toolbar */}
      {activeTab !== "library" && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={activeTab === "templates" ? "Search templates..." : "Search programs..."}
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
          </div>

          {role === "CLINICIAN" && (
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" className="gap-2" asChild>
                <Link href="/programs/upload">
                  <Upload className="h-4 w-4 text-emerald-600" />
                  Upload Brief
                </Link>
              </Button>
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
      )}

      {/* Grid */}
      {activeTab !== "library" && (filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Library className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <h3 className="mt-4 font-semibold">
            {activeTab === "templates" ? "No templates found" : "No programs found"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {role === "CLINICIAN"
              ? activeTab === "templates"
                ? "Create a template or duplicate a program to build your library."
                : "Generate an AI program or create one manually to get started."
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
                    {updatableSet.has(program.id) && (
                      <Badge className="border border-amber-200 bg-amber-100 text-[11px] font-medium text-amber-700">
                        Update available
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
      ))}

      {/* Template Library tab */}
      {activeTab === "library" && (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {globalPrograms.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-border p-12 text-center">
              <Globe className="mx-auto h-12 w-12 text-muted-foreground/40" />
              <h3 className="mt-4 font-semibold">No global programs yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Your administrator hasn&apos;t added any default programs yet.
              </p>
            </div>
          )}
          {globalPrograms.map((prog) => (
            <Card
              key={prog.id}
              className="group flex flex-col border-0 shadow-sm ring-1 ring-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-border"
            >
              <CardContent className="flex flex-1 flex-col p-5">
                <div className="flex items-start gap-2">
                  <Globe className="mt-0.5 h-4 w-4 shrink-0 text-primary/60" />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold leading-tight">{prog.name}</h3>
                    {prog.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{prog.description}</p>
                    )}
                  </div>
                </div>
                {prog.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {prog.tags.slice(0, 4).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  {prog._count.workouts} workout{prog._count.workouts !== 1 ? "s" : ""}
                </p>
                <div className="mt-4 border-t border-border/60 pt-3">
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={copying === prog.id}
                    onClick={() => handleCopyGlobal(prog.id, prog.name)}
                  >
                    {copying === prog.id ? "Copying…" : "Copy to My Library"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
