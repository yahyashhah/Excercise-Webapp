import { getCurrentUser, isSuperAdmin } from "@/lib/current-user";
import { BulkImportForm } from "@/components/exercises/bulk-import-form";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";

export default async function BulkImportPage() {
  const user = await getCurrentUser();
  const admin = await isSuperAdmin();
  if (user.role !== "TRAINER" && !admin) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-5xl">
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link href="/exercises">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Exercises
        </Link>
      </Button>
      <PageHeader
        title="Bulk Import Exercises"
        description="Upload multiple exercise videos at once, then use AI to generate metadata for each one."
      />
      <BulkImportForm />
    </div>
  );
}
