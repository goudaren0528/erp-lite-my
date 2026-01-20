import { getDb, updateDb } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { BackupLog } from "@/types";
import { format } from "date-fns";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const typesParam = searchParams.get('types');
    const types = typesParam ? typesParam.split(',') : null;
    
    const currentUser = await getCurrentUser();
    const db = await getDb();
    
    let exportData: any = {};
    
    if (types && types.length > 0) {
        types.forEach(key => {
            if (key in db) {
                exportData[key] = (db as any)[key];
            }
        });
    } else {
        // If no specific types requested, export all (or default behavior)
        exportData = db;
    }

    // Log the export operation
    await updateDb(async (db) => {
        const log: BackupLog = {
            id: Math.random().toString(36).substring(2, 9),
            type: 'EXPORT',
            status: 'SUCCESS',
            operator: currentUser?.name || 'Unknown',
            details: types ? `Exported: ${types.join(', ')}` : 'Full Export',
            timestamp: new Date().toISOString()
        };
        // Ensure backupLogs exists
        if (!db.backupLogs) db.backupLogs = [];
        db.backupLogs.unshift(log); // Add to beginning
        // Keep only last 50 logs
        if (db.backupLogs.length > 50) db.backupLogs = db.backupLogs.slice(0, 50);
        return log;
    });

    const data = JSON.stringify(exportData, null, 2);
    
    return new NextResponse(data, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="erp-lite-export-${format(new Date(), 'yyyyMMdd-HHmmss')}.json"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Failed to export database' }, { status: 500 });
  }
}
