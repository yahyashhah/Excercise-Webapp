import { requireRole } from "@/lib/current-user";
import { getAuditLogs, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import { AuditLogTable } from "@/components/audit-log/audit-log-table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Building2 } from "lucide-react";
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
        <PageHeader title="Audit Log" description="Activity across your clinic." />
        <EmptyState
          icon={Building2}
          title="No organization set up"
          description="Set up your organization to see activity here."
        />
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
      <PageHeader title="Audit Log" description="Activity across your clinic." />

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
