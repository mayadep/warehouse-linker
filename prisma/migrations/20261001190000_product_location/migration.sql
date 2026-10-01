-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "locationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Product_locationId_key" ON "Product"("locationId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
