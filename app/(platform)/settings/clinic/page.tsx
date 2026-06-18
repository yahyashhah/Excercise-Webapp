import { requireRole } from "@/lib/current-user";
import { getOrganizationProfile } from "@/actions/organization-actions";
import { OrganizationProfileForm } from "@/components/settings/organization-profile-form";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function OrganizationSettingsPage() {
  await requireRole("TRAINER");
  const profile = await getOrganizationProfile();

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href="/settings">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Settings
          </Link>
        </Button>
        <h2 className="text-2xl font-bold text-slate-900">Organization Profile</h2>
        <p className="text-slate-600">Customize your organization branding for PDF exports</p>
      </div>
      <OrganizationProfileForm initialData={profile ?? undefined} />
    </div>
  );
}
