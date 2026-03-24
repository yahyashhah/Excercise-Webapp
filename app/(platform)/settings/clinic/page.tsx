import { requireRole } from "@/lib/current-user";
import { getClinicProfile } from "@/lib/services/clinic.service";
import { ClinicProfileForm } from "@/components/settings/clinic-profile-form";

export default async function ClinicSettingsPage() {
  const user = await requireRole("CLINICIAN");
  const profile = await getClinicProfile(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Clinic Profile</h2>
        <p className="text-slate-600">
          Customize your clinic branding for PDF exports
        </p>
      </div>
      <ClinicProfileForm
        initialData={
          profile
            ? {
                clinicName: profile.clinicName,
                tagline: profile.tagline ?? "",
                logoUrl: profile.logoUrl ?? "",
                phone: profile.phone ?? "",
                email: profile.email ?? "",
                website: profile.website ?? "",
                address: profile.address ?? "",
              }
            : undefined
        }
      />
    </div>
  );
}
