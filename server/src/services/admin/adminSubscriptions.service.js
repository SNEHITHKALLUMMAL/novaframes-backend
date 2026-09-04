import { Subscription } from '../../models/Subscription.model.js';

export async function listAllSubscriptions({ plan, status, page, limit }) {
  const filter = {};
  if (plan) filter.plan = plan;
  if (status) filter.status = status;

  const [subscriptions, total] = await Promise.all([
    Subscription.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name email')
      .lean(),
    Subscription.countDocuments(filter),
  ]);

  return { subscriptions, total, page, limit };
}
