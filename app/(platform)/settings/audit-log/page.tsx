import { requireRole } from "@/lib/current-user";
import { getAuditLogs, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import { AuditLogTable } from "@/components/audit-log/audit-log-table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface PageProps {
  searchParams: Promise<{ action?: string; page?: string }>;
}

export default async function TrainerAuditLogPage({ searchParams }: PageProps) {
  const trainer = await requireRole("TRAINER");

  if (!trainer.clerkOrgId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">Set up your organization to see activity here.</p>
        </div>
      </div>
    );
  }

  const params = await searchParams;
  const action = params.action && params.action !== "ALL" ? params.action : undefined;
  const page = parseInt(params.page ?? "1", 10);

  const { entries, total, totalPages } = await getAuditLogs({
    orgId: trainer.clerkOrgId ?? undefined,
    action,
    page,
    pageSize: 25,
  });

  const queryString = action ? `action=${action}` : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">Activity across your clinic.</p>
      </div>

      <form method="GET" className="flex flex-col gap-3 sm:flex-row sm:items-center flex-wrap">
        <Select name="action" defaultValue={action ?? "ALL"}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All actions</SelectItem>
            {Object.values(AUDIT_ACTIONS).map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button type="submit" className="rounded-xl bg-primary/10 px-4 py-2 text-sm font-medium text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-colors">
          Filter
        </button>
      </form>

      <AuditLogTable
        entries={entries}
        total={total}
        page={page}
        totalPages={totalPages}
        basePath="/settings/audit-log"
        queryString={queryString}
      />
    </div>
  );
}
