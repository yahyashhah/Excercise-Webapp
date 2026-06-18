import { getCurrentUser } from "@/lib/current-user";
import { getClientsForTrainer } from "@/lib/services/client.service";
import { NewAssessmentForm } from "@/components/outcomes/new-assessment-form";

export default async function NewAssessmentPage() {
  const user = await getCurrentUser();

  let clients: { id: string; firstName: string; lastName: string }[] = [];
  if (user.role === "TRAINER") {
    clients = await getClientsForTrainer(user.id);
  }

  return (
    <div className="mx-auto max-w-lg">
      <NewAssessmentForm
        role={user.role}
        selfClientId={user.role === "CLIENT" ? user.id : undefined}
        clients={clients}
      />
    </div>
  );
}
