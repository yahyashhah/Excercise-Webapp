import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) redirect("/onboarding");
  if (!user.onboarded) redirect("/onboarding");

  const unreadCount = await prisma.message.count({
    where: { recipientId: user.id, isRead: false },
  });

  return (
    <div className="flex h-screen overflow-hidden bg-[oklch(0.97_0.005_247)]">
      <Sidebar
        role={user.role}
        currentPath=""
        unreadMessageCount={unreadCount}
        userName={`${user.firstName} ${user.lastName}`}
        userEmail={user.email}
        userImageUrl={user.imageUrl}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={user} unreadMessageCount={unreadCount} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="page-enter">{children}</div>
        </main>
      </div>
    </div>
  );
}
