import { requireSuperAdmin } from "@/lib/current-user";
import { GlobalGenerateWrapper } from "./global-generate-wrapper";

export default async function AdminGenerateGlobalProgramPage() {
  await requireSuperAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Generate Global Program</h1>
        <p className="text-muted-foreground">
          Use AI to create a master program that will be available to all clinics.
        </p>
      </div>
      <div className="max-w-2xl">
        <GlobalGenerateWrapper />
      </div>
    </div>
  );
}
