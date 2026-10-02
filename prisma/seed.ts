// 샘플 상품을 DB Product 테이블에 넣는다. 이미 있는 SKU는 이름/분류/단위 정보만 갱신하고 재고·판매가는 건드리지 않는다.
// 기본 창고 6개(냉장·냉동·실온 각 2, 랙 50 × 4단 × 6구획)도 만든다. 이미 있는 창고코드는 건너뛴다.
// 기본 계정 admin(관리자)·staff(직원)도 만든다. 이미 있는 아이디는 건너뛴다.
// 실행: npx prisma db seed
import { PrismaClient, type ProductUnit, type UserRole } from "@prisma/client";
import { hashPassword } from "../modules/user/password";
import { sampleProducts } from "../data/sampleProducts";
import { DEFAULT_SAFETY_STOCK } from "../modules/product/defaults";
import { seedDefaultWarehouses } from "../modules/warehouse/builder";

const prisma = new PrismaClient();

const SEED_USERS: { loginId: string; name: string; role: UserRole; password: string }[] = [
  { loginId: "admin", name: "관리자", role: "ADMIN", password: "admin1234" },
  { loginId: "staff", name: "직원", role: "STAFF", password: "staff1234" },
];

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

  // 기본 계정 (이미 있는 아이디는 건드리지 않음). 첫 로그인 후 사용자·권한 화면에서 비밀번호를 바꿀 것
  for (const u of SEED_USERS) {
    const exists = await prisma.user.findUnique({ where: { loginId: u.loginId }, select: { id: true } });
    if (exists) continue;
    await prisma.user.create({
      data: { loginId: u.loginId, name: u.name, role: u.role, passwordHash: await hashPassword(u.password) },
    });
    console.log(`seed 완료: 계정 ${u.loginId} / ${u.password} (${u.role})`);
  }

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
