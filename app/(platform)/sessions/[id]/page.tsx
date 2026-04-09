import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { notFound, redirect } from "next/navigation";
import { WorkoutSessionTracker } from "@/components/workout/workout-session-tracker";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  const session = await prisma.workoutSessionV2.findUnique({
    where: { id },
    include: {
      patient: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
      workout: {
        include: {
          program: {
            select: {
              clinicianId: true,
            },
          },
          blocks: {
            orderBy: { orderIndex: "asc" },
            include: {
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
  const isPatientOwner = session.patientId === user.id;
  const isProgramClinician = session.workout.program.clinicianId === user.id;

  if (!isPatientOwner && !isProgramClinician) return redirect("/dashboard");

  return <WorkoutSessionTracker session={session as any} />;
}
