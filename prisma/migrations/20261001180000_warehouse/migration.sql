-- CreateEnum
CREATE TYPE "StorageType" AS ENUM ('REFRIGERATED', 'FROZEN', 'AMBIENT');

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "storageType" "StorageType" NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rack" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "levels" INTEGER NOT NULL,
    "binsPerLevel" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "rackId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "bin" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Rack_warehouseId_number_key" ON "Rack"("warehouseId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Location_code_key" ON "Location"("code");

-- CreateIndex
CREATE INDEX "Location_warehouseId_idx" ON "Location"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_rackId_level_bin_key" ON "Location"("rackId", "level", "bin");

-- AddForeignKey
ALTER TABLE "Rack" ADD CONSTRAINT "Rack_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "Rack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 수동 추가: 랙 번호·단·구획 범위
ALTER TABLE "Rack" ADD CONSTRAINT "Rack_number_range" CHECK ("number" BETWEEN 1 AND 999);
ALTER TABLE "Rack" ADD CONSTRAINT "Rack_levels_range" CHECK ("levels" BETWEEN 1 AND 20);
ALTER TABLE "Rack" ADD CONSTRAINT "Rack_binsPerLevel_range" CHECK ("binsPerLevel" BETWEEN 1 AND 50);
ALTER TABLE "Location" ADD CONSTRAINT "Location_level_bin_positive" CHECK ("level" >= 1 AND "bin" >= 1);
