-- CreateIndex
CREATE INDEX "Product_category_sku_idx" ON "Product"("category", "sku");

-- CreateIndex
CREATE INDEX "Product_stock_idx" ON "Product"("stock");
