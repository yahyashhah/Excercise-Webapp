import { z } from "zod";

export const clinicProfileSchema = z.object({
  clinicName: z.string().min(1, "Clinic name is required").max(200),
  tagline: z.string().max(500).optional().or(z.literal("")),
  logoUrl: z.string().url().optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  website: z.string().url().optional().or(z.literal("")),
  address: z.string().max(500).optional().or(z.literal("")),
});

export type ClinicProfileInput = z.infer<typeof clinicProfileSchema>;
