-- AlterTable
ALTER TABLE "Outbound" ADD COLUMN     "pickExpiryDate" DATE,
ADD COLUMN     "pickFixed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pickLocationId" TEXT;

-- AddForeignKey
ALTER TABLE "Outbound" ADD CONSTRAINT "Outbound_pickLocationId_fkey" FOREIGN KEY ("pickLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
