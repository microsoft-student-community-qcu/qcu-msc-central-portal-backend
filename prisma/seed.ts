import { PrismaClient } from "@prisma/client";
import { auth } from "../src/config/auth";

const prisma = new PrismaClient();

async function main() {
  const isProd = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "release" || process.env.BRANCH_NAME === "main";

  const hrAdminEmail = process.env.SEED_HR_ADMIN_EMAIL;
  const hrAdminPassword = process.env.SEED_HR_ADMIN_PASSWORD;

  const logisticsAdminEmail = process.env.SEED_LOGISTICS_ADMIN_EMAIL;
  const logisticsAdminPassword = process.env.SEED_LOGISTICS_ADMIN_PASSWORD;

  // Enforce secrets strictly on production or main branch to prevent insecure defaults
  if (isProd) {
    if (!hrAdminEmail || !hrAdminPassword || !logisticsAdminEmail || !logisticsAdminPassword) {
      throw new Error("Seeding on production or main branch requires all SEED_* environment variables to be defined.");
    }
  }

  // Fallback to local defaults if not in production
  const finalHREmail = hrAdminEmail || "hr_admin@qcu.edu.ph";
  const finalHRPassword = hrAdminPassword || "AdminPassHR123!";
  const hrAdminName = "System HR Admin";
  const hrAdminStudentId = "00-0001";

  const finalLogisticsEmail = logisticsAdminEmail || "logistics_admin@qcu.edu.ph";
  const finalLogisticsPassword = logisticsAdminPassword || "AdminPassLogistics123!";
  const finalLogisticsName = "System Logistics Admin";
  const finalLogisticsStudentId = "00-0002";

  console.log("Seeding started...");

  // 1. HR Admin
  const existingHR = await prisma.user.findUnique({
    where: { email: finalHREmail },
  });

  if (!existingHR) {
    console.log(`Creating HR Admin: ${finalHREmail}`);
    await auth.api.signUpEmail({
      body: {
        email: finalHREmail,
        password: finalHRPassword,
        name: hrAdminName,
        firstName: "System",
        lastName: "HR Admin",
        studentId: hrAdminStudentId,
      },
    });

    await prisma.user.update({
      where: { email: finalHREmail },
      data: { role: "ADMIN_HR" },
    });
    console.log("HR Admin created and role updated.");
  } else {
    console.log(`HR Admin ${finalHREmail} already exists.`);
  }

  // 2. Logistics Admin
  const existingLogistics = await prisma.user.findUnique({
    where: { email: finalLogisticsEmail },
  });

  if (!existingLogistics) {
    console.log(`Creating Logistics Admin: ${finalLogisticsEmail}`);
    await auth.api.signUpEmail({
      body: {
        email: finalLogisticsEmail,
        password: finalLogisticsPassword,
        name: finalLogisticsName,
        firstName: "System",
        lastName: "Logistics Admin",
        studentId: finalLogisticsStudentId,
      },
    });

    await prisma.user.update({
      where: { email: finalLogisticsEmail },
      data: { role: "ADMIN_LOGISTICS" },
    });
    console.log("Logistics Admin created and role updated.");
  } else {
    console.log(`Logistics Admin ${finalLogisticsEmail} already exists.`);
  }

  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
