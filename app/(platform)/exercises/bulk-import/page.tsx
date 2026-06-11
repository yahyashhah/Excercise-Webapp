import { requireSuperAdmin } from "@/lib/current-user";
import { BulkImportForm } from "@/components/exercises/bulk-import-form";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function BulkImportPage() {
  await requireSuperAdmin();

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href="/exercises">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Exercises
          </Link>
        </Button>
        <h2 className="text-2xl font-bold">Bulk Import Exercises</h2>
        <p className="mt-1 text-muted-foreground">
          Upload multiple exercise videos at once, then use AI to generate metadata for each one.
        </p>
      </div>
      <BulkImportForm />
    </div>
  );
}
