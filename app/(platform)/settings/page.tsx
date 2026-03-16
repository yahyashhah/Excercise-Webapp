import { getCurrentUser } from "@/lib/current-user";
import { UserProfile } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatUserRole } from "@/lib/utils/formatting";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
        <p className="text-slate-600">Manage your account settings</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-700">Name:</span>
            <span className="text-slate-600">
              {user.firstName} {user.lastName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-700">Email:</span>
            <span className="text-slate-600">{user.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-700">Role:</span>
            <Badge variant="secondary">{formatUserRole(user.role)}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Clerk account management */}
      <div className="overflow-hidden rounded-lg">
        <UserProfile
          appearance={{
            elements: {
              rootBox: "w-full",
              cardBox: "shadow-none border border-slate-200 rounded-lg",
            },
          }}
        />
      </div>
    </div>
  );
}
