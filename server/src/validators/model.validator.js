import { z } from 'zod';
import { GENERATION_TYPES } from '../constants/enums.js';

export const listModelsQuerySchema = z.object({
  type: z.enum(Object.values(GENERATION_TYPES)).optional(),
});
