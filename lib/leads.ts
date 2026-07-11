import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const leadSchema = z.object({
  email: z.email("Enter a valid email").max(320),
  message: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v ? v : undefined)),
  path: z.string().trim().max(300).startsWith("/", "Invalid path"),
  // Honeypot — real users never see or fill this field.
  website: z.string().optional(),
});

export type LeadInput = z.infer<typeof leadSchema>;

export async function createLead(input: { email: string; message?: string; path: string }) {
  return prisma.lead.create({
    data: {
      email: input.email,
      message: input.message,
      path: input.path,
    },
  });
}

export async function listLeads(limit = 200) {
  return prisma.lead.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
