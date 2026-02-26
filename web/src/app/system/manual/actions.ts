'use server'

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type ManualChapterInput = {
  id?: string;
  title: string;
  content: string;
  order: number;
  isEnabled: boolean;
};

export async function getManualChapters() {
  return await prisma.manualChapter.findMany({
    orderBy: { order: 'asc' }
  });
}

export async function getEnabledManualChapters() {
  return await prisma.manualChapter.findMany({
    where: { isEnabled: true },
    orderBy: { order: 'asc' }
  });
}

export async function upsertManualChapter(data: ManualChapterInput) {
  try {
    const { id, ...rest } = data;
    if (id) {
      await prisma.manualChapter.update({
        where: { id },
        data: rest
      });
    } else {
      await prisma.manualChapter.create({
        data: rest
      });
    }
    revalidatePath('/system/manual');
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export async function deleteManualChapter(id: string) {
  try {
    await prisma.manualChapter.delete({ where: { id } });
    revalidatePath('/system/manual');
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export async function updateManualChapterOrder(updates: { id: string; order: number }[]) {
    try {
        await prisma.$transaction(
            updates.map((u) =>
                prisma.manualChapter.update({
                    where: { id: u.id },
                    data: { order: u.order },
                })
            )
        );
        revalidatePath('/system/manual');
        return { success: true };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}
