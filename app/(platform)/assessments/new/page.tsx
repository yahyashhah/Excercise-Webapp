import { getCurrentUser } from "@/lib/current-user";
import { getPatientsForClinician } from "@/lib/services/patient.service";
import { NewAssessmentForm } from "@/components/outcomes/new-assessment-form";

export default async function NewAssessmentPage() {
  const user = await getCurrentUser();

  let patients: { id: string; firstName: string; lastName: string }[] = [];
  if (user.role === "CLINICIAN") {
    patients = await getPatientsForClinician(user.id);
  }

  return (
    <div className="mx-auto max-w-lg">
      <NewAssessmentForm
        role={user.role}
        selfPatientId={user.role === "PATIENT" ? user.id : undefined}
        patients={patients}
      />
    </div>
  );
}
