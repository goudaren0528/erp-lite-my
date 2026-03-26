'use server'

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import fs from "fs";
import path from "path";

export type ManualChapterInput = {
  id?: string;
  title: string;
  content: string;
  order: number;
  isEnabled: boolean;
};

async function ensureManualSeeded() {
  const count = await prisma.manualChapter.count();
  if (count === 0) {
    try {
      const filePath = path.join(process.cwd(), 'USER_MANUAL.md');
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        await prisma.manualChapter.create({
          data: {
            title: '系统操作指南',
            content: content,
            order: 0,
            isEnabled: true
          }
        });
      }
    } catch (e) {
      console.error('Failed to seed manual:', e);
    }
  }
}

export async function getManualChapters() {
  await ensureManualSeeded();
  return await prisma.manualChapter.findMany({
    orderBy: { order: 'asc' }
  });
}

export async function getEnabledManualChapters() {
  await ensureManualSeeded();
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
