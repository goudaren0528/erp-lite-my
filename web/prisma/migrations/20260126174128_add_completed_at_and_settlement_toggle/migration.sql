/*
  Warnings:

  - You are about to drop the `CommissionConfig` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN "completedAt" DATETIME;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "CommissionConfig";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "AccountGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "settlementByCompleted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ChannelConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "settlementByCompleted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'QUANTITY',
    "minCount" INTEGER NOT NULL,
    "maxCount" INTEGER,
    "percentage" REAL NOT NULL,
    "accountGroupId" TEXT,
    "channelConfigId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommissionRule_accountGroupId_fkey" FOREIGN KEY ("accountGroupId") REFERENCES "AccountGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommissionRule_channelConfigId_fkey" FOREIGN KEY ("channelConfigId") REFERENCES "ChannelConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "permissions" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "accountGroupId" TEXT,
    CONSTRAINT "User_accountGroupId_fkey" FOREIGN KEY ("accountGroupId") REFERENCES "AccountGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "id", "name", "password", "permissions", "role", "updatedAt", "username") SELECT "createdAt", "id", "name", "password", "permissions", "role", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "AccountGroup_name_key" ON "AccountGroup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelConfig_name_key" ON "ChannelConfig"("name");
