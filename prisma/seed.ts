// 샘플 상품을 DB Product 테이블에 넣는다. 이미 있는 SKU는 이름/분류/단위 정보만 갱신하고 재고·판매가는 건드리지 않는다.
// 기본 창고 6개(냉장·냉동·실온 각 2, 랙 50 × 4단 × 6구획)도 만든다. 이미 있는 창고코드는 건너뛴다.
// 실행: npx prisma db seed
import { PrismaClient, type ProductUnit } from "@prisma/client";
import { sampleProducts } from "../data/sampleProducts";
import { DEFAULT_SAFETY_STOCK } from "../modules/product/defaults";
import { seedDefaultWarehouses } from "../modules/warehouse/builder";

const prisma = new PrismaClient();

async function main() {
  for (const p of sampleProducts) {
    await prisma.product.upsert({
      where: { sku: p.itemCode },
      update: {
        name: p.name,
        category: p.category,
        baseUnit: p.baseUnit as ProductUnit,
        boxQty: p.baseUnit === "BOX" ? 1 : p.boxQty,
        trackExpiry: p.trackExpiry,
      },
      create: {
        sku: p.itemCode,
        name: p.name,
        category: p.category,
        price: 0,
        stock: 0,
        safetyStock: DEFAULT_SAFETY_STOCK,
        baseUnit: p.baseUnit as ProductUnit,
        boxQty: p.baseUnit === "BOX" ? 1 : p.boxQty,
        trackExpiry: p.trackExpiry,
      },
    });
  }
  console.log(`seed 완료: 상품 ${sampleProducts.length}개`);

  const created = await seedDefaultWarehouses(prisma);
  console.log(
    created.length
      ? `seed 완료: 창고 ${created.join(", ")} 생성`
      : "seed: 기본 창고가 이미 모두 있어 건너뜀"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
