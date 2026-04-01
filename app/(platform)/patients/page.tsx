import Link from "next/link";
import { requireRole } from "@/lib/current-user";
import { getPatientsForClinician } from "@/lib/services/patient.service";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Users, ChevronRight, Mail } from "lucide-react";
import { AddPatientDialog } from "@/components/patients/add-patient-dialog";

export default async function PatientsPage() {
  const user = await requireRole("CLINICIAN");
  const patients = await getPatientsForClinician(user.id);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {patients.length} client{patients.length !== 1 ? "s" : ""} linked to your account
          </p>
        </div>
        <AddPatientDialog />
      </div>

      {patients.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Users className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <h3 className="mt-4 text-base font-semibold">No clients yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Link a client by their email address. They must have signed up on INMOTUS RX first.
          </p>
          <div className="mt-5">
            <AddPatientDialog />
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {patients.map((patient) => (
            <Link key={patient.id} href={`/patients/${patient.id}`} className="group block">
              <Card className="border-border/60 transition-all duration-200 hover:shadow-md hover:border-primary/20 hover:-translate-y-0.5">
                <CardContent className="flex items-center gap-4 p-5">
                  <Avatar className="h-12 w-12 shrink-0 ring-2 ring-border/40 group-hover:ring-primary/20 transition-all">
                    <AvatarImage src={patient.imageUrl || undefined} />
                    <AvatarFallback className="bg-primary/8 text-primary font-semibold text-sm">
                      {patient.firstName[0]}{patient.lastName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground truncate">
                      {patient.firstName} {patient.lastName}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{patient.email}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
