import { requireRole } from "@/lib/current-user";
import { getOrganizationProfile } from "@/actions/organization-actions";
import { ClinicProfileForm } from "@/components/settings/clinic-profile-form";

export default async function ClinicSettingsPage() {
  await requireRole("CLINICIAN");
  const profile = await getOrganizationProfile();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Clinic Profile</h2>
        <p className="text-slate-600">Customize your clinic branding for PDF exports</p>
      </div>
      <ClinicProfileForm initialData={profile ?? undefined} />
    </div>
  );
}
