import { requireSuperAdmin } from "@/lib/current-user";
import { CsvImportForm } from "@/components/exercises/csv-import-form";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function AdminCsvImportPage() {
  await requireSuperAdmin();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/exercises"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Exercises
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-foreground">Import Exercises from CSV</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Bulk-add exercises to the platform library. Download the template, fill it in with AI,
          add YouTube URLs, then upload.
        </p>
      </div>
      <div className="mx-auto max-w-3xl">
        <CsvImportForm />
      </div>
    </div>
  );
}
