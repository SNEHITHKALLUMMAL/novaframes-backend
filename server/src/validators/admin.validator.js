import { z } from 'zod';
import { USER_ROLES, JOB_STATUS, SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUS } from '../constants/enums.js';

export const listUsersQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  role: z.enum(Object.values(USER_ROLES)).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const setUserRoleSchema = z.object({
  role: z.enum(Object.values(USER_ROLES)),
});

export const setUserActiveSchema = z.object({
  isActive: z.boolean(),
});

export const listAdminJobsQuerySchema = z.object({
  status: z.enum(Object.values(JOB_STATUS)).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const listAdminSubscriptionsQuerySchema = z.object({
  plan: z.enum(Object.values(SUBSCRIPTION_PLANS)).optional(),
  status: z.enum(Object.values(SUBSCRIPTION_STATUS)).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const listAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

const GENERATION_TYPES_FOR_MODEL = ['text-to-video', 'image-to-video', 'text-image-to-video'];

export const createModelSchema = z.object({
  name: z.string().trim().min(1).max(150),
  modelId: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'modelId may only contain lowercase letters, numbers, and hyphens'),
  provider: z.string().trim().max(100).optional().default(''),
  description: z.string().trim().max(2000).optional().default(''),
  capabilities: z.array(z.enum(GENERATION_TYPES_FOR_MODEL)).min(1, 'Select at least one capability'),
  supportedResolutions: z.array(z.string().regex(/^\d+x\d+$/)).min(1),
  supportedDurationsSeconds: z.array(z.number().positive()).min(1),
  vramRequirementGB: z.number().min(0).optional().default(0),
  license: z.string().trim().max(200).optional().default('Unspecified — must be verified before enabling in production'),
  commercialUseAllowed: z.boolean().optional().default(false),
  adapterKey: z.string().trim().min(1).max(50),
});

export const updateModelFullSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    provider: z.string().trim().max(100).optional(),
    description: z.string().trim().max(2000).optional(),
    capabilities: z.array(z.enum(GENERATION_TYPES_FOR_MODEL)).min(1).optional(),
    supportedResolutions: z.array(z.string().regex(/^\d+x\d+$/)).min(1).optional(),
    supportedDurationsSeconds: z.array(z.number().positive()).min(1).optional(),
    vramRequirementGB: z.number().min(0).optional(),
    license: z.string().trim().max(200).optional(),
    commercialUseAllowed: z.boolean().optional(),
    adapterKey: z.string().trim().min(1).max(50).optional(),
    isEnabled: z.boolean().optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export const createModelVersionSchema = z.object({
  version: z.string().trim().min(1).max(50),
  releaseNotes: z.string().trim().max(2000).optional().default(''),
});
