import { Request, Response } from "express";
import {
  createDraftSchema,
  updateDraftBatch1Schema,
  updateDraftBatch2Schema,
  submitDraftSchema,
} from "../schemas/application-draft.schema";
import { prisma } from "../config/database";
import { ocrStore } from "../config/ocrStore";
import { saveDocument } from "../utils/imageStorage";
import { signSetupToken } from "../utils/token";
import { sendSetupLinkEmail } from "../services/email.service";


function getDraftOr404(id: string) {
  return prisma.applicationDraft.findUnique({ where: { id } });
}


/**
 * POST /api/v1/applicants/draft
 *
 * Batch 0 — Creates an application draft after a successful OCR scan.
 * Consumes the OCR session and stores basic personal info + identity data.
 */
export async function createDraft(req: Request, res: Response): Promise<void> {
  try {
    const parsed = createDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { lastName, firstName, middleInitial, email, ocrSessionId } = parsed.data;

    const session = ocrStore.getSession(ocrSessionId);
    if (!session) {
      res.status(400).json({
        success: false,
        message:
          "OCR session expired or invalid. Please re-verify your Student ID via POST /api/v1/ocr/verify.",
      });
      return;
    }

    const draft = await prisma.applicationDraft.create({
      data: {
        currentStep: 0,
        ocrSessionId,
        lastName,
        firstName,
        middleInitial: middleInitial ?? null,
        email,
        studentId: session.studentId,
        idImagePath: session.imagePath,
        manual_application: session.manualRequired,
      },
    });

    res.status(201).json({
      success: true,
      data: { draftId: draft.id },
      message: "Draft created successfully. Proceed to Batch 1.",
    });
  } catch (error) {
    console.error("Error creating draft:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create application draft. Please try again.",
    });
  }
}


/**
 * PATCH /api/v1/applicants/draft/:draftId/batch-1
 *
 * Batch 1 — Personal information.
 */
export async function updateDraftBatch1(req: Request, res: Response): Promise<void> {
  try {
    const { draftId } = req.params;

    const draft = await getDraftOr404(draftId);
    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Application draft not found.",
      });
      return;
    }

    if (draft.currentStep !== 0) {
      res.status(400).json({
        success: false,
        message:
          draft.currentStep > 0
            ? "Batch 1 has already been completed. Proceed to the next step."
            : "Please complete Batch 0 first by calling POST /api/v1/applicants/draft.",
      });
      return;
    }

    const parsed = updateDraftBatch1Schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { dateOfBirth, placeOfBirth, gender, cellphoneNumber, houseAddress, facebookLink } =
      parsed.data;

    const updated = await prisma.applicationDraft.update({
      where: { id: draftId },
      data: {
        dateOfBirth: new Date(dateOfBirth),
        placeOfBirth,
        gender,
        cellphoneNumber,
        houseAddress,
        facebookLink,
        currentStep: 1,
      },
    });

    res.status(200).json({
      success: true,
      data: { currentStep: updated.currentStep },
      message: "Batch 1 saved. Proceed to Batch 2.",
    });
  } catch (error) {
    console.error("Error updating draft batch 1:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save Batch 1. Please try again.",
    });
  }
}


/**
 * PATCH /api/v1/applicants/draft/:draftId/batch-2
 *
 * Batch 2 — Academic information + document uploads.
 * Multer middleware handles the file fields before this handler runs.
 */
export async function updateDraftBatch2(req: Request, res: Response): Promise<void> {
  try {
    const { draftId } = req.params;

    const draft = await getDraftOr404(draftId);
    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Application draft not found.",
      });
      return;
    }

    if (draft.currentStep !== 1) {
      res.status(400).json({
        success: false,
        message:
          draft.currentStep < 1
            ? "Please complete Batch 1 first."
            : "Batch 2 has already been completed. Proceed to the final step.",
      });
      return;
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

    req.body._certificateOfRegistration =
      files?.certificateOfRegistration?.length ? "true" : undefined;
    req.body._curriculumVitae =
      files?.curriculumVitae?.length ? "true" : undefined;

    const parsed = updateDraftBatch2Schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { college, program, section, campus, office } = parsed.data;

    const uploadedFiles = files as NonNullable<typeof files>;
    const certificateOfRegistrationPath = await saveDocument(
      uploadedFiles.certificateOfRegistration[0].buffer,
      `cor_draft_${Date.now()}_${uploadedFiles.certificateOfRegistration[0].originalname}`,
      uploadedFiles.certificateOfRegistration[0].mimetype
    );

    const curriculumVitaePath = await saveDocument(
      uploadedFiles.curriculumVitae[0].buffer,
      `cv_draft_${Date.now()}_${uploadedFiles.curriculumVitae[0].originalname}`,
      uploadedFiles.curriculumVitae[0].mimetype
    );

    const updated = await prisma.applicationDraft.update({
      where: { id: draftId },
      data: {
        college,
        program,
        section,
        campus,
        office,
        certificateOfRegistration: certificateOfRegistrationPath,
        curriculumVitae: curriculumVitaePath,
        currentStep: 2,
      },
    });

    res.status(200).json({
      success: true,
      data: { currentStep: updated.currentStep },
      message: "Batch 2 saved. Ready for final submission.",
    });
  } catch (error) {
    console.error("Error updating draft batch 2:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save Batch 2. Please try again.",
    });
  }
}


/**
 * POST /api/v1/applicants/draft/:draftId/submit
 *
 * Batch 3 (final) — Additional information.
 * Creates the real Applicant record from all draft data, sends the setup
 * link email, and deletes the draft.
 */
export async function submitDraft(req: Request, res: Response): Promise<void> {
  try {
    const { draftId } = req.params;

    const draft = await getDraftOr404(draftId);
    if (!draft) {
      res.status(404).json({
        success: false,
        message: "Application draft not found.",
      });
      return;
    }

    if (draft.currentStep !== 2) {
      res.status(400).json({
        success: false,
        message:
          draft.currentStep < 2
            ? "Please complete Batch 2 first."
            : "This draft has already been submitted.",
      });
      return;
    }

    const parsed = submitDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const {
      interestsSkillsHobbies,
      organizationHistory,
      portfolio,
      githubOrProjectLinks,
      previousWorksAchievements,
    } = parsed.data;

    const applicant = await prisma.applicant.create({
      data: {
        lastName: draft.lastName!,
        firstName: draft.firstName!,
        middleInitial: draft.middleInitial,
        email: draft.email!,
        qcuMscEmail: draft.email!,
        college: draft.college!,
        program: draft.program!,
        section: draft.section!,
        campus: draft.campus!,
        studentId: draft.studentId,
        dateOfBirth: draft.dateOfBirth!,
        placeOfBirth: draft.placeOfBirth!,
        gender: draft.gender!,
        membershipRole: draft.office!,
        certificateOfRegistration: draft.certificateOfRegistration!,
        curriculumVitae: draft.curriculumVitae!,
        houseAddress: draft.houseAddress!,
        cellphoneNumber: draft.cellphoneNumber!,
        facebookLink: draft.facebookLink!,
        interestsSkillsHobbies,
        organizationHistory,
        portfolio: portfolio ?? null,
        githubOrProjectLinks: githubOrProjectLinks ?? null,
        previousWorksAchievements: previousWorksAchievements ?? null,
        idImagePath: draft.idImagePath,
        manual_application: draft.manual_application ?? false,
      },
    });

    await prisma.applicationDraft.delete({ where: { id: draftId } });

    const setupToken = await signSetupToken(applicant.id, applicant.email);
    await sendSetupLinkEmail(applicant.email, setupToken);

    res.status(201).json({
      success: true,
      data: {
        id: applicant.id,
        status: applicant.status,
      },
      message: "Application submitted successfully. Check your email for the setup link.",
    });
  } catch (error) {
    console.error("Error submitting draft:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit application. Please try again.",
    });
  }
}
