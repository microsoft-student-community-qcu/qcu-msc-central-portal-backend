/**
 * Shared Prisma client instance.
 * Import this from any module that needs database access.
 * @example import { prisma } from "../config/database";
 */
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
