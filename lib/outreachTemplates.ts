import { prisma } from "@/lib/prisma";

export async function listOutreachTemplates() {
  return prisma.outreachTemplate.findMany({ orderBy: { name: "asc" } });
}

export async function getOutreachTemplate(id: string) {
  return prisma.outreachTemplate.findUnique({ where: { id } });
}

export async function createOutreachTemplate(input: { name: string; subject: string; body: string }) {
  return prisma.outreachTemplate.create({ data: input });
}

export async function updateOutreachTemplate(
  id: string,
  input: { name?: string; subject?: string; body?: string }
) {
  return prisma.outreachTemplate.update({ where: { id }, data: input });
}

export async function deleteOutreachTemplate(id: string) {
  return prisma.outreachTemplate.delete({ where: { id } });
}
