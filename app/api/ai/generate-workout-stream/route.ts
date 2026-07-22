import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateProgramEvents } from "@/lib/services/program-generation.service";
import { mapPlanToProgram } from "@/lib/services/ai.service";
import { toAIGenerationError } from "@/lib/ai/errors";

export const maxDuration = 300;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser || dbUser.role !== "TRAINER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = await req.json();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        for await (const event of generateProgramEvents(params, { signal: req.signal })) {
          if (event.type === "done") {
            send({ ...event, program: mapPlanToProgram(event.plan, params) });
          } else {
            send(event);
          }
        }
      } catch (error) {
        console.error("AI stream generation failed:", error);
        const aiError = toAIGenerationError(error);
        try {
          send({
            type: "error",
            kind: aiError.kind,
            message: aiError.message,
            retryable: aiError.retryable,
          });
        } catch {
          // Client already disconnected — the controller is closed and there is
          // nothing to send to. Nothing we can do; swallow it.
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      // client disconnected — generateProgramEvents aborts via req.signal
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
