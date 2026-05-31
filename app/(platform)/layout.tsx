import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/current-user";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) {
    if (orgId) redirect("/onboarding/patient");
    redirect("/onboarding");
  }
  if (!user.onboarded) {
    if (user.role === "PATIENT") redirect("/onboarding/patient");
    redirect("/onboarding");
  }

  const [unreadMessageCount, unreadNotificationCount, initialNotifications, adminAccess] =
    await Promise.all([
      prisma.message.count({
        where: { recipientId: user.id, isRead: false },
      }),
      prisma.notification.count({
        where: { userId: user.id, isRead: false },
      }),
      prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      isSuperAdmin(),
    ]);

  return (
    <div className="flex h-screen overflow-hidden bg-[oklch(0.97_0.005_247)]">
      <Sidebar
        role={user.role}
        currentPath=""
        unreadMessageCount={unreadMessageCount}
        userName={`${user.firstName} ${user.lastName}`}
        userEmail={user.email}
        userImageUrl={user.imageUrl}
        isAdmin={adminAccess}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          user={user}
          unreadMessageCount={unreadMessageCount}
          unreadNotificationCount={unreadNotificationCount}
          initialNotifications={initialNotifications}
        />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="page-enter">{children}</div>
        </main>
      </div>
    </div>
  );
}
