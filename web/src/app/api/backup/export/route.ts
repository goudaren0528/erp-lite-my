import { getDb } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const typesParam = searchParams.get('types');
    const types = typesParam ? typesParam.split(',') : null;
    
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

    const data = JSON.stringify(exportData, null, 2);
    
    return new NextResponse(data, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="erp-lite-export-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to export database' }, { status: 500 });
  }
}
