import { z } from 'zod';
import { GENERATION_TYPES, JOB_STATUS } from '../constants/enums.js';
import { objectIdSchema } from './common.validator.js';

export const createGenerationJobSchema = z.object({
  type: z.enum(Object.values(GENERATION_TYPES)),
  aiModelId: objectIdSchema,
  projectId: objectIdSchema.nullable().optional(),
  prompt: z.string().trim().max(2000).optional().default(''),
  negativePrompt: z.string().trim().max(2000).optional().default(''),
  inputFileIds: z.array(objectIdSchema).max(4).optional().default([]),
  parameters: z.record(z.any()).optional().default({}),
});

export const listGenerationJobsQuerySchema = z.object({
  status: z.enum(Object.values(JOB_STATUS)).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});
