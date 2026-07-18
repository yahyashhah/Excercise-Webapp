import { UserProfile } from "@clerk/nextjs"
import { PageHeader } from "@/components/shared/page-header"

export default async function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your account and profile" />

      <div className="overflow-hidden rounded-lg">
        <UserProfile
          appearance={{
            elements: {
              rootBox: "w-full",
              cardBox: "shadow-none border border-border rounded-lg",
            },
          }}
        />
      </div>
    </div>
  )
}
