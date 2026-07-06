import { UserProfile } from "@clerk/nextjs"
import { PageHeader } from "@/components/shared/page-header"
import { getCurrentUser } from "@/lib/current-user"
import { getConnectionsForClient } from "@/lib/services/wearable.service"
import { WearableConnectionCard } from "@/components/settings/wearable-connection-card"

export default async function SettingsPage() {
  const user = await getCurrentUser()
  const connections =
    user.role === "CLIENT" ? await getConnectionsForClient(user.id) : []

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your account and profile" />

      {user.role === "CLIENT" && (
        <WearableConnectionCard initialConnections={connections} />
      )}

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
