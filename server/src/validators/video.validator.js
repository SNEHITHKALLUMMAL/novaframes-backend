import { z } from 'zod';
import { GENERATION_TYPES, VIDEO_STATUS } from '../constants/enums.js';
import { objectIdSchema } from './common.validator.js';

export const listVideosQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  type: z.enum(Object.values(GENERATION_TYPES)).optional(),
  status: z.enum(Object.values(VIDEO_STATUS)).optional(),
  projectId: z
    .union([objectIdSchema, z.literal('none')])
    .optional(),
  sort: z.enum(['newest', 'oldest', 'title']).optional().default('newest'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(24),
});

export const renameVideoSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(150),
});

export const assignVideoProjectSchema = z.object({
  projectId: objectIdSchema.nullable(),
});
