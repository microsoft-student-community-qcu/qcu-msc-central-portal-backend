import { z } from "zod";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png"];

export const ocrUploadSchema = z.object({
  image: z
    .instanceof(File)
    .refine((file) => ALLOWED_MIME_TYPES.includes(file.type), {
      message: "Image must be JPEG or PNG",
    })
    .refine((file) => file.size <= MAX_FILE_SIZE, {
      message: "Image must not exceed 5MB",
    }),
});

export type OcrUploadSchema = z.infer<typeof ocrUploadSchema>;
