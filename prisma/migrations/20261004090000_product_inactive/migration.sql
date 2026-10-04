-- 상품 비활성화(단종)
ALTER TYPE "ProductStatus" ADD VALUE IF NOT EXISTS 'INACTIVE';
