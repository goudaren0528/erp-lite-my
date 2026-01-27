-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CommissionRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'QUANTITY',
    "minCount" INTEGER NOT NULL,
    "maxCount" INTEGER,
    "percentage" REAL NOT NULL,
    "target" TEXT NOT NULL DEFAULT 'USER',
    "accountGroupId" TEXT,
    "channelConfigId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommissionRule_accountGroupId_fkey" FOREIGN KEY ("accountGroupId") REFERENCES "AccountGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommissionRule_channelConfigId_fkey" FOREIGN KEY ("channelConfigId") REFERENCES "ChannelConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CommissionRule" ("accountGroupId", "channelConfigId", "createdAt", "id", "maxCount", "minCount", "percentage", "type", "updatedAt") SELECT "accountGroupId", "channelConfigId", "createdAt", "id", "maxCount", "minCount", "percentage", "type", "updatedAt" FROM "CommissionRule";
DROP TABLE "CommissionRule";
ALTER TABLE "new_CommissionRule" RENAME TO "CommissionRule";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
