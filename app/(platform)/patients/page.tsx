import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/current-user";
import { getPatientsForClinician } from "@/lib/services/patient.service";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, ChevronRight } from "lucide-react";
import { AddPatientDialog } from "@/components/patients/add-patient-dialog";
import { PatientSearch } from "@/components/patients/patient-search";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function PatientsPage({ searchParams }: Props) {
  const user = await requireRole("CLINICIAN");
  const { q } = await searchParams;
  const allPatients = await getPatientsForClinician(user.id);

  const patients = q
    ? allPatients.filter((p) => {
        const full = `${p.firstName} ${p.lastName} ${p.email}`.toLowerCase();
        return full.includes(q.toLowerCase());
      })
    : allPatients;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Clients</h2>
          <p className="text-muted-foreground">
            {allPatients.length} client{allPatients.length !== 1 ? "s" : ""} linked
          </p>
        </div>
        <AddPatientDialog />
      </div>

      <Suspense fallback={<Skeleton className="h-10 w-full max-w-sm" />}>
        <PatientSearch />
      </Suspense>

      {patients.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-semibold">
            {q ? "No clients match your search" : "No clients yet"}
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {q
              ? `No results for "${q}". Try a different name or email.`
              : "Click \"Add Client\" above to link a patient by their email address. They must have signed up first."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {patients.map((patient) => (
            <Link key={patient.id} href={`/patients/${patient.id}`}>
              <Card className="transition-all hover:shadow-md hover:border-primary/20 hover:-translate-y-0.5">
                <CardContent className="flex items-center gap-4 p-5">
                  <Avatar className="h-12 w-12 border-2 border-primary/10">
                    <AvatarImage src={patient.imageUrl || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {patient.firstName[0]}
                      {patient.lastName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {patient.firstName} {patient.lastName}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{patient.email}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/50" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
