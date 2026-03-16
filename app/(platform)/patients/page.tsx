import Link from "next/link";
import { requireRole } from "@/lib/current-user";
import { getPatientsForClinician } from "@/lib/services/patient.service";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, ChevronRight } from "lucide-react";
import { AddPatientDialog } from "@/components/patients/add-patient-dialog";

export default async function PatientsPage() {
  const user = await requireRole("CLINICIAN");
  const patients = await getPatientsForClinician(user.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Patients</h2>
          <p className="text-muted-foreground">{patients.length} patient{patients.length !== 1 ? "s" : ""} linked</p>
        </div>
        <AddPatientDialog />
      </div>

      {patients.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-semibold">No patients yet</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Click &quot;Add Patient&quot; above to link a patient by their email
            address. They must have signed up first.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {patients.map((patient) => (
            <Link key={patient.id} href={`/patients/${patient.id}`}>
              <Card className="transition-all hover:shadow-md hover:border-primary/20">
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
                  <ChevronRight className="h-5 w-5 text-muted-foreground/50" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
