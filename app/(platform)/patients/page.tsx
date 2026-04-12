import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/current-user";
import { getPatientsForClinician } from "@/lib/services/patient.service";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, ChevronRight, Mail } from "lucide-react";
import { AddPatientDialog } from "@/components/patients/add-patient-dialog";
import { PatientSearch } from "@/components/patients/patient-search";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

// Generate a consistent gradient from the first letter
const avatarGradients = [
  "from-blue-400 to-indigo-500",
  "from-violet-400 to-purple-500",
  "from-emerald-400 to-teal-500",
  "from-rose-400 to-pink-500",
  "from-amber-400 to-orange-500",
  "from-cyan-400 to-blue-500",
];

function getAvatarGradient(name: string) {
  const idx = name.charCodeAt(0) % avatarGradients.length;
  return avatarGradients[idx];
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Clients</h2>
          <p className="text-muted-foreground">
            {allPatients.length} client{allPatients.length !== 1 ? "s" : ""} linked to your practice
          </p>
        </div>
        <AddPatientDialog />
      </div>

      {/* Search */}
      <Suspense fallback={<Skeleton className="h-10 w-full max-w-sm" />}>
        <PatientSearch />
      </Suspense>

      {/* Grid */}
      {patients.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <Users className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h3 className="mt-5 text-lg font-semibold">
            {q ? "No clients match your search" : "No clients yet"}
          </h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            {q
              ? `No results for "${q}". Try a different name or email.`
              : "Click \"Add Client\" above to link a patient by their email address. They must have already signed up."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {patients.map((patient) => {
            const gradient = getAvatarGradient(patient.firstName);
            const initials = `${patient.firstName[0]}${patient.lastName[0]}`;

            return (
              <Link key={patient.id} href={`/patients/${patient.id}`}>
                <Card className="group border-0 shadow-sm ring-1 ring-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-border">
                  <CardContent className="flex items-center gap-4 p-5">
                    <Avatar className="h-12 w-12 shrink-0 ring-2 ring-white shadow-md">
                      <AvatarImage src={patient.imageUrl || undefined} />
                      <AvatarFallback
                        className={`bg-linear-to-br ${gradient} text-sm font-bold text-white`}
                      >
                        {initials}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold leading-tight transition-colors group-hover:text-primary">
                        {patient.firstName} {patient.lastName}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" />
                        {patient.email}
                      </p>
                      {/* Role badge */}
                      <Badge
                        variant="outline"
                        className="mt-2 h-5 border-border/60 px-1.5 text-[10px] font-medium text-muted-foreground"
                      >
                        Patient
                      </Badge>
                    </div>

                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
