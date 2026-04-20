import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/current-user";
import { getPatientDetail } from "@/lib/services/patient.service";
import * as progressService from "@/lib/services/progress.service";
import * as noteService from "@/lib/services/clinical-note.service";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import { PhotosTab } from "@/components/progress/photos-tab";
import { MetricsTab } from "@/components/progress/metrics-tab";
import { SoapNotesTab } from "@/components/progress/soap-notes-tab";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PatientProgressPage({ params }: Props) {
  const { id } = await params;
  const user = await requireRole("CLINICIAN");
  const patient = await getPatientDetail(id);

  if (!patient) notFound();

  // Fetch all progress data in parallel
  const [photos, metrics, metricTypes, notes] = await Promise.all([
    progressService.getProgressPhotos(patient.id),
    progressService.getBodyMetrics(patient.id),
    progressService.getBodyMetricTypes(patient.id),
    noteService.getNotesForPatient(patient.id, user.id),
  ]);

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/patients/${id}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Patient
          </Link>
        </Button>
      </div>

      {/* Patient header */}
      <Card className="border-0 shadow-sm ring-1 ring-border/50">
        <CardContent className="flex items-center gap-5 p-5">
          <Avatar className="h-14 w-14">
            <AvatarImage src={patient.imageUrl ?? undefined} />
            <AvatarFallback className="text-base">
              {patient.firstName[0]}
              {patient.lastName[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-lg font-bold">
              {patient.firstName} {patient.lastName}
            </h1>
            <p className="text-sm text-muted-foreground">{patient.email}</p>
          </div>
          <div className="ml-auto">
            <p className="text-right text-sm font-semibold text-muted-foreground">
              Progress Tracking
            </p>
            <p className="text-right text-xs text-muted-foreground/70">
              {photos.length} photos &middot; {metricTypes.length} metric types &middot; {notes.length} notes
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Main tabs */}
      <Tabs defaultValue="photos">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="photos">
            Progress Photos ({photos.length})
          </TabsTrigger>
          <TabsTrigger value="metrics">
            Body Metrics ({metricTypes.length})
          </TabsTrigger>
          <TabsTrigger value="notes">
            Clinical Notes — SOAP ({notes.length})
          </TabsTrigger>
        </TabsList>

        {/* ---------------------------------------------------------------- */}
        {/* Photos tab                                                        */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="photos" className="mt-5">
          <PhotosTab photos={photos} patientId={patient.id} />
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* Body metrics tab                                                  */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="metrics" className="mt-5">
          <MetricsTab
            metrics={metrics}
            metricTypes={metricTypes}
            patientId={patient.id}
          />
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* SOAP notes tab                                                    */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="notes" className="mt-5">
          <SoapNotesTab notes={notes} patientId={patient.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
