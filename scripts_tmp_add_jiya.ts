import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const pw = await bcrypt.hash("not-used-google-login-only", 10);
  const user = await prisma.user.upsert({
    where: { email: "jiya.bhagat@theboredmonkey.com" },
    update: { role: "CXO", name: "Jiya Bhagat" },
    create: {
      name: "Jiya Bhagat",
      email: "jiya.bhagat@theboredmonkey.com",
      passwordHash: pw,
      role: "CXO",
    },
  });
  console.log("OK:", user.email, user.role);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
