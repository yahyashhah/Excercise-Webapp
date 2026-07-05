"use client";

import {
  GenerateProgramForm,
  type GenerateExercisesHandler,
} from "@/components/programs/generate-program-form";
import { generateGlobalProgramAction } from "@/actions/global-program-actions";

interface Props {
  clinics: { id: string; name: string }[];
}

export function GlobalGenerateWrapper({ clinics }: Props) {
  const handleGenerate: GenerateExercisesHandler = async (params) => {
    return generateGlobalProgramAction(
      params as Parameters<typeof generateGlobalProgramAction>[0]
    );
  };

  return (
    <GenerateProgramForm
      clients={[]}
      clinics={clinics}
      onGenerateExercises={handleGenerate}
      redirectTo="/admin/global-programs"
    />
  );
}
