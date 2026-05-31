import { getAllUsers } from "@/lib/services/admin.service";
import { format } from "date-fns";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Users } from "lucide-react";

interface PageProps {
  searchParams: Promise<{ search?: string; role?: string; page?: string }>;
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search ?? "";
  const role = (params.role as "CLINICIAN" | "PATIENT" | "ALL") ?? "ALL";
  const page = parseInt(params.page ?? "1", 10);

  const { items: users, total, totalPages } = await getAllUsers({ page, pageSize: 25, search, role });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {total.toLocaleString()} registered users on the platform.
        </p>
      </div>

      <form method="GET" className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="search"
            defaultValue={search}
            placeholder="Search name or email…"
            className="pl-9"
          />
        </div>
        <Select name="role" defaultValue={role}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All roles</SelectItem>
            <SelectItem value="CLINICIAN">Clinician</SelectItem>
            <SelectItem value="PATIENT">Patient</SelectItem>
          </SelectContent>
        </Select>
        <button
          type="submit"
          className="rounded-xl bg-primary/10 px-4 py-2 text-sm font-medium text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-colors"
        >
          Filter
        </button>
      </form>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">User</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Role</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden md:table-cell">Connections</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden lg:table-cell">Status</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted overflow-hidden">
                        {u.imageUrl ? (
                          <Image src={u.imageUrl} alt="" fill className="object-cover" />
                        ) : (
                          <span className="text-xs font-bold text-muted-foreground">
                            {u.firstName[0]}{u.lastName[0]}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{u.firstName} {u.lastName}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <Badge
                      variant="outline"
                      className={
                        u.role === "CLINICIAN"
                          ? "border-blue-500/30 bg-blue-500/10 text-blue-600 text-[10px]"
                          : "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 text-[10px]"
                      }
                    >
                      {u.role === "CLINICIAN" ? "Clinician" : "Patient"}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell text-muted-foreground text-xs">
                    {u.role === "CLINICIAN"
                      ? `${u.connectionCount} patient${u.connectionCount !== 1 ? "s" : ""}`
                      : `${u.connectionCount} clinician${u.connectionCount !== 1 ? "s" : ""}`}
                  </td>
                  <td className="px-5 py-3 hidden lg:table-cell">
                    {u.onboarded ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Onboarding
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {format(new Date(u.createdAt), "MMM d, yyyy")}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center">
                    <Users className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No users found.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages} · {total.toLocaleString()} users
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <a href={`?search=${search}&role=${role}&page=${page - 1}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">
                  ← Prev
                </a>
              )}
              {page < totalPages && (
                <a href={`?search=${search}&role=${role}&page=${page + 1}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">
                  Next →
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
