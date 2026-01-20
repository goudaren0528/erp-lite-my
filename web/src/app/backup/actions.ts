'use server'

import { getDb, updateDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { BackupLog, DB } from "@/types";
import { revalidatePath } from "next/cache";

export async function getBackupLogs() {
    const db = await getDb();
    return db.backupLogs || [];
}

export async function importData(formData: FormData) {
    try {
        const file = formData.get('file') as File;
        if (!file) {
            throw new Error('No file uploaded');
        }

        const text = await file.text();
        const data = JSON.parse(text);
        const currentUser = await getCurrentUser();

        return await updateDb(async (db) => {
            const importedTypes: string[] = [];

            // Helper to merge arrays based on ID
            const mergeCollection = <T extends { id: string }>(
                current: T[], 
                incoming: T[], 
                name: string
            ) => {
                if (!incoming || !Array.isArray(incoming)) return;
                
                let added = 0;
                let updated = 0;

                incoming.forEach(item => {
                    const index = current.findIndex(c => c.id === item.id);
                    if (index >= 0) {
                        current[index] = { ...current[index], ...item };
                        updated++;
                    } else {
                        current.push(item);
                        added++;
                    }
                });
                
                if (added > 0 || updated > 0) {
                    importedTypes.push(`${name}(+${added}/~${updated})`);
                }
            };

            // Merge each known collection
            if (data.users) mergeCollection(db.users, data.users, 'Users');
            if (data.products) mergeCollection(db.products, data.products, 'Products');
            if (data.promoters) mergeCollection(db.promoters, data.promoters, 'Promoters');
            if (data.orders) mergeCollection(db.orders, data.orders, 'Orders');
            if (data.commissionConfigs) {
                // Commission Configs might not have IDs in the same way, or might be just a list.
                // The interface has role, minCount, maxCount. No explicit ID.
                // For this one, maybe we just replace? Or try to match?
                // Given the schema: { role, minCount, maxCount, percentage }
                // Let's replace for simplicity or skip if complex.
                // Or maybe just append if not exact match?
                // Let's replace the whole config list if provided, as it's configuration.
                if (Array.isArray(data.commissionConfigs)) {
                    db.commissionConfigs = data.commissionConfigs;
                    importedTypes.push('CommissionConfigs(Replaced)');
                }
            }

            // Log the operation
            const log: BackupLog = {
                id: Math.random().toString(36).substring(2, 9),
                type: 'IMPORT',
                status: 'SUCCESS',
                operator: currentUser?.name || 'Unknown',
                details: importedTypes.length > 0 ? `Imported: ${importedTypes.join(', ')}` : 'No valid data found',
                timestamp: new Date().toISOString()
            };

            if (!db.backupLogs) db.backupLogs = [];
            db.backupLogs.unshift(log);
            if (db.backupLogs.length > 50) db.backupLogs = db.backupLogs.slice(0, 50);

            // Revalidate all pages
            revalidatePath('/', 'layout');
            
            return { success: true, message: `Import successful: ${log.details}` };
        });

    } catch (error: any) {
        // Log failure if possible (requires a separate updateDb call if we want to persist the failure log, 
        // but if the main update failed, maybe we shouldn't try to write to DB again immediately or it might fail too.
        // For now, just return error.)
        return { success: false, message: error.message || "Import failed" };
    }
}
