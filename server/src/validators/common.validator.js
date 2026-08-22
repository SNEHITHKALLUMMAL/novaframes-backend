import { z } from 'zod';

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

export const objectIdSchema = z.string().regex(OBJECT_ID_RE, 'Invalid id format');

export const idParamSchema = z.object({
  id: objectIdSchema,
});
