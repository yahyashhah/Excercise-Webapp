import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { WorkoutModeWrapper } from "@/components/workout/workout-mode-wrapper";

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id } = await params;
  const { mode } = await searchParams;
  const user = await getCurrentUser();

  const session = await prisma.workoutSessionV2.findUnique({
    where: { id },
    include: {
      client: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
      workout: {
        include: {
          program: {
            select: {
              trainerId: true,
            },
          },
          blocks: {
            orderBy: { orderIndex: "asc" },
            select: {
              id: true,
              type: true,
              rounds: true,
              restBetweenRounds: true,
              name: true,
              orderIndex: true,
              exercises: {
                orderBy: { orderIndex: "asc" },
                include: {
                  exercise: {
                    include: { media: true }
                  },
                  sets: {
                    orderBy: { orderIndex: "asc" }
                  }
                }
              }
            }
          }
        }
      },
      exerciseLogs: {
        include: {
          setLogs: true
        }
      }
    }
  });

  if (!session) return notFound();
  const isClientOwner = session.clientId === user.id;
  const isProgramTrainer = session.workout.program.trainerId === user.id;

  if (!isClientOwner && !isProgramTrainer) return redirect("/dashboard");

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Dashboard
        </Link>
      </Button>
      <WorkoutModeWrapper
        session={session as any}
        initialMode={mode === "checklist" || mode === "session" ? mode : undefined}
      />
    </div>
  );
}
