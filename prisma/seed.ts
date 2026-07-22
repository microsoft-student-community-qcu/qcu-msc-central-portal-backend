import { PrismaClient } from "@prisma/client";
import { auth } from "../src/config/auth";

const prisma = new PrismaClient();

async function main() {
  const isProd = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "release" || process.env.BRANCH_NAME === "main";

  const hrAdminEmail = process.env.SEED_HR_ADMIN_EMAIL;
  const hrAdminPassword = process.env.SEED_HR_ADMIN_PASSWORD;

  const logisticsAdminEmail = process.env.SEED_LOGISTICS_ADMIN_EMAIL;
  const logisticsAdminPassword = process.env.SEED_LOGISTICS_ADMIN_PASSWORD;

  const applicantEmail = process.env.SEED_APPLICANT_EMAIL;
  const applicantPassword = process.env.SEED_APPLICANT_PASSWORD;

  const memberEmail = process.env.SEED_MEMBER_EMAIL;
  const memberPassword = process.env.SEED_MEMBER_PASSWORD;

  // Enforce secrets strictly on production or main branch to prevent insecure defaults
  if (isProd) {
    if (
      !hrAdminEmail ||
      !hrAdminPassword ||
      !logisticsAdminEmail ||
      !logisticsAdminPassword ||
      !applicantEmail ||
      !applicantPassword ||
      !memberEmail ||
      !memberPassword
    ) {
      throw new Error("Seeding on production or main branch requires all SEED_* environment variables to be defined.");
    }
  }

  // Fallback to local defaults if not in production
  const finalHREmail = hrAdminEmail || "hr_admin@gmail.com";
  const finalHRPassword = hrAdminPassword || "AdminPassHR123!";
  const hrAdminName = "System HR Admin";
  const hrAdminStudentId = "00-0001";

  const finalLogisticsEmail = logisticsAdminEmail || "logistics_admin@gmail.com";
  const finalLogisticsPassword = logisticsAdminPassword || "AdminPassLogistics123!";
  const finalLogisticsName = "System Logistics Admin";
  const finalLogisticsStudentId = "00-0002";

  const finalApplicantEmail = applicantEmail || "applicant_sample@gmail.com";
  const finalApplicantPassword = applicantPassword || "ApplicantPass123!";
  const applicantName = "Sample Applicant";
  const applicantStudentId = "00-0003";

  const finalMemberEmail = memberEmail || "member_sample@gmail.com";
  const finalMemberPassword = memberPassword || "MemberPass123!";
  const memberName = "Sample Member";
  const memberStudentId = "00-0004";

  console.log("Seeding started...");

  // 1. HR Admin
  const existingHR = await prisma.user.findFirst({
    where: { OR: [{ email: finalHREmail }, { studentId: hrAdminStudentId }] },
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
    if (existingHR.email !== finalHREmail) {
      console.log(`Updating HR Admin email from ${existingHR.email} to ${finalHREmail}...`);
      await prisma.user.update({
        where: { id: existingHR.id },
        data: { email: finalHREmail, role: "ADMIN_HR" },
      });
    } else {
      console.log(`HR Admin ${finalHREmail} already exists.`);
    }
  }

  // 2. Logistics Admin
  const existingLogistics = await prisma.user.findFirst({
    where: { OR: [{ email: finalLogisticsEmail }, { studentId: finalLogisticsStudentId }] },
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
    if (existingLogistics.email !== finalLogisticsEmail) {
      console.log(`Updating Logistics Admin email from ${existingLogistics.email} to ${finalLogisticsEmail}...`);
      await prisma.user.update({
        where: { id: existingLogistics.id },
        data: { email: finalLogisticsEmail, role: "ADMIN_LOGISTICS" },
      });
    } else {
      console.log(`Logistics Admin ${finalLogisticsEmail} already exists.`);
    }
  }

  // 3. Sample Applicant
  const existingApplicant = await prisma.user.findFirst({
    where: { OR: [{ email: finalApplicantEmail }, { studentId: applicantStudentId }] },
  });

  if (!existingApplicant) {
    console.log(`Creating Sample Applicant: ${finalApplicantEmail}`);
    await auth.api.signUpEmail({
      body: {
        email: finalApplicantEmail,
        password: finalApplicantPassword,
        name: applicantName,
        firstName: "Sample",
        lastName: "Applicant",
        studentId: applicantStudentId,
      },
    });

    await prisma.user.update({
      where: { email: finalApplicantEmail },
      data: { role: "APPLICANT" },
    });
    console.log("Sample Applicant created and role updated.");
  } else {
    if (existingApplicant.email !== finalApplicantEmail) {
      console.log(`Updating Sample Applicant email from ${existingApplicant.email} to ${finalApplicantEmail}...`);
      await prisma.user.update({
        where: { id: existingApplicant.id },
        data: { email: finalApplicantEmail, role: "APPLICANT" },
      });
    } else {
      console.log(`Sample Applicant ${finalApplicantEmail} already exists.`);
    }
  }

  // 4. Sample Member
  const existingMember = await prisma.user.findFirst({
    where: { OR: [{ email: finalMemberEmail }, { studentId: memberStudentId }] },
  });

  if (!existingMember) {
    console.log(`Creating Sample Member: ${finalMemberEmail}`);
    await auth.api.signUpEmail({
      body: {
        email: finalMemberEmail,
        password: finalMemberPassword,
        name: memberName,
        firstName: "Sample",
        lastName: "Member",
        studentId: memberStudentId,
      },
    });

    await prisma.user.update({
      where: { email: finalMemberEmail },
      data: { role: "MEMBER" },
    });
    console.log("Sample Member created and role updated.");
  } else {
    if (existingMember.email !== finalMemberEmail) {
      console.log(`Updating Sample Member email from ${existingMember.email} to ${finalMemberEmail}...`);
      await prisma.user.update({
        where: { id: existingMember.id },
        data: { email: finalMemberEmail, role: "MEMBER" },
      });
    } else {
      console.log(`Sample Member ${finalMemberEmail} already exists.`);
    }
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
