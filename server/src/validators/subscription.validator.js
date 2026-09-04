import { z } from 'zod';
import { SUBSCRIPTION_PLANS } from '../constants/enums.js';

export const subscribeSchema = z.object({
  plan: z.enum(Object.values(SUBSCRIPTION_PLANS)),
  billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
});
