"use client";

import {
  GenerateProgramForm,
  type GenerateExercisesHandler,
} from "@/components/programs/generate-program-form";
import { generateGlobalProgramAction } from "@/actions/global-program-actions";

export function GlobalGenerateWrapper() {
  const handleGenerate: GenerateExercisesHandler = async (params) => {
    return generateGlobalProgramAction(
      params as Parameters<typeof generateGlobalProgramAction>[0]
    );
  };

  return (
    <GenerateProgramForm
      patients={[]}
      onGenerateExercises={handleGenerate}
      redirectTo="/admin/global-programs"
    />
  );
}
