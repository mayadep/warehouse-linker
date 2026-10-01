-- CreateTable
CREATE TABLE "ProductLocationHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fromCode" TEXT,
    "toCode" TEXT,
    "swappedWithSku" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductLocationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductLocationHistory_productId_createdAt_idx" ON "ProductLocationHistory"("productId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProductLocationHistory" ADD CONSTRAINT "ProductLocationHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
