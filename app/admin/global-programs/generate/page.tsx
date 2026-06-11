import { requireSuperAdmin } from "@/lib/current-user";
import { GlobalGenerateWrapper } from "./global-generate-wrapper";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function AdminGenerateGlobalProgramPage() {
  await requireSuperAdmin();

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href="/admin/global-programs">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Global Programs
          </Link>
        </Button>
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
