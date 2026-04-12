"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()))
      return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (templateOnly && !p.isTemplate) return false;
    return true;
  });

  const statusColor: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    ACTIVE: "bg-green-100 text-green-700",
    PAUSED: "bg-yellow-100 text-yellow-700",
    COMPLETED: "bg-blue-100 text-blue-700",
    ARCHIVED: "bg-red-100 text-red-700",
  };

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
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search programs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
            <SelectTrigger className="w-35">
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
          <div className="flex items-center gap-2">
            <Switch checked={templateOnly} onCheckedChange={setTemplateOnly} />
            <span className="text-sm text-muted-foreground">
              Templates only
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 mt-4 sm:mt-0">
          {role === "CLINICIAN" && (
            <>
              <Button variant="outline" className="gap-2" asChild>
                <Link href="/programs/generate">
                  <Sparkles className="h-4 w-4 text-blue-600" />
                  Generate with AI
                </Link>
              </Button>
              <Button asChild>
                <Link href="/programs/new">
                  <Plus className="mr-2 h-4 w-4" />
                  New Program
                </Link>
              </Button>
            </>
          )}
        </div>
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((program) => (
            <Card
              key={program.id}
              className="group hover:shadow-md transition-shadow"
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <Link href={`/programs/${program.id}`} className="flex-1">
                  <CardTitle className="text-lg font-semibold line-clamp-1 group-hover:underline">
                    {program.name}
                  </CardTitle>
                </Link>
                {role === "CLINICIAN" && (<DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted">
                    <MoreVertical className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() =>
                        router.push(`/programs/${program.id}/edit`)
                      }
                    >
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDuplicate(program.id)}
                    >
                      <Copy className="mr-2 h-4 w-4" /> Duplicate
                    </DropdownMenuItem>
                    {!program.patientId && (
                      <DropdownMenuItem
                        onClick={() =>
                          router.push(
                            `/programs/${program.id}?assign=true`
                          )
                        }
                      >
                        <UserPlus className="mr-2 h-4 w-4" /> Assign
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => handleArchive(program.id)}
                      className="text-destructive"
                    >
                      <Archive className="mr-2 h-4 w-4" /> Archive
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>)}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-3">
                  <Badge className={statusColor[program.status] || ""}>
                    {program.status}
                  </Badge>
                  {program.isTemplate && (
                    <Badge variant="outline">Template</Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>
                    {program.patient
                      ? `${program.patient.firstName} ${program.patient.lastName}`
                      : "Unassigned"}
                  </p>
                  <p>
                    {program._count.workouts} workout
                    {program._count.workouts !== 1 ? "s" : ""}
                  </p>
                  <p>
                    Updated{" "}
                    {formatDistanceToNow(new Date(program.updatedAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}


