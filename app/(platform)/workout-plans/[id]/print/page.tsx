import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getPlanById } from "@/lib/services/workout-plan.service";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PrintPreviewPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();
  const plan = await getPlanById(id);

  if (!plan) notFound();

  // Verify access
  if (user.role === "PATIENT" && plan.patientId !== user.id) notFound();
  if (user.role === "CLINICIAN" && plan.createdById !== user.id) notFound();

  const pdfUrl = `/api/workout-plans/${id}/pdf`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/workout-plans/${id}`}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to Plan
            </Link>
          </Button>
          <span className="text-sm font-medium text-slate-700">
            Print Preview: {plan.title}
          </span>
        </div>
        <Button size="sm" asChild>
          <a href={pdfUrl} download>
            <Download className="mr-1 h-4 w-4" />
            Download PDF
          </a>
        </Button>
      </div>
      <div className="flex-1">
        <iframe
          src={pdfUrl}
          className="h-full w-full border-0"
          title="PDF Preview"
        />
      </div>
    </div>
  );
}
