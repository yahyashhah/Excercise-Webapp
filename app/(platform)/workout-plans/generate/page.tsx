import { requireRole } from "@/lib/current-user";
import { getPatientsForClinician } from "@/lib/services/patient.service";
import { GeneratePlanForm } from "@/components/workout/generate-plan-form";

export default async function GeneratePlanPage() {
  const user = await requireRole("CLINICIAN");
  const patients = await getPatientsForClinician(user.id);

  return (
    <div className="mx-auto max-w-2xl">
      <GeneratePlanForm
        patients={patients.map((p) => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
        }))}
      />
    </div>
  );
}
