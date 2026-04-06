"use client";

import { useTransition } from "react";
import { experimental_useObject } from "@ai-sdk/react";
import { z } from "zod";
import { toast } from "sonner";
import { saveAiTemplateAction } from "@/actions/workout-actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

// Define schema locally (or import it if available in shared)
const blockExerciseSchema = z.object({
  exerciseId: z.string(),
  sets: z.number().optional(),
  reps: z.number().optional(),
  durationSeconds: z.number().optional(),
  restSeconds: z.number().optional(),
  notes: z.string().optional(),
});

const workoutBlockSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  exercises: z.array(blockExerciseSchema),
});

const workoutPlanSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  daysPerWeek: z.number().optional(),
  blocks: z.array(workoutBlockSchema),
});

export function AiGenerationForm() {
  const router = useRouter();
  const [isSaving, startTransition] = useTransition();

  const { object, isLoading, submit } = experimental_useObject({
    api: "/api/ai/generate-program",
    schema: workoutPlanSchema,
    onError: (error: any) => {
      toast.error(error.message || "Failed to generate plan");
    },
    onFinish: (result: any) => {
      toast.success("Generation complete. Saving template...");
      saveTemplate(result?.object);
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const painLevel = formData.get("painLevel") as string;
    const availableEquipment = formData.get("availableEquipment") as string;
    const daysPerWeek = Number(formData.get("daysPerWeek"));
    const additionalNotes = formData.get("additionalNotes") as string;
    submit({ painLevel, availableEquipment, daysPerWeek, additionalNotes });
  };

  const saveTemplate = (planData: any) => {
    if (!planData || !planData.title || !planData.blocks) return;
    startTransition(async () => {
      const res = await saveAiTemplateAction(planData);
      if (res.success) {
        toast.success("AI Template saved successfully!");
        router.refresh();
      } else {
        toast.error(res.error || "Failed to save AI template");
      }
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
      <Card>
        <CardHeader>
          <CardTitle>AI Program Generator</CardTitle>
          <CardDescription>
            Input basic patient context, and our AI will build a template for you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form id="ai-gen-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="painLevel">Pain Level (1-10)</Label>
              <Input id="painLevel" name="painLevel" type="number" min="1" max="10" placeholder="e.g. 4" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="availableEquipment">Available Equipment</Label>
              <Input
                id="availableEquipment"
                name="availableEquipment"
                placeholder="e.g. Dumbbells, resistance bands, nothing..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="daysPerWeek">Days per week</Label>
              <Input id="daysPerWeek" name="daysPerWeek" type="number" min="1" max="7" defaultValue={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="additionalNotes">Additional Notes / Restrictions</Label>
              <Textarea id="additionalNotes" name="additionalNotes" placeholder="e.g. Needs low impact shoulder variants" />
            </div>
          </form>
        </CardContent>
        <CardFooter>
          <Button type="submit" form="ai-gen-form" disabled={isLoading || isSaving} className="w-full">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Draft...
              </>
            ) : isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving Template...
              </>
            ) : (
              "Generate Program"
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* Preview Section */}
      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>Streaming generation preview</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted p-4 rounded-md min-h-[300px] max-h-[500px] overflow-y-auto whitespace-pre-wrap text-sm font-mono">
            {isLoading || object ? (
              JSON.stringify(object, null, 2)
            ) : (
              <span className="text-muted-foreground italic">Template output will appear here...</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
