export const createOrder = asyncHandler(async (req, res) => {
  logger.info('createOrder request received', {
    requestId: req.id,
    userId: req.user?._id?.toString(),
    bodyKeys: Object.keys(req.body || {}),
    plan: req.body?.plan,
    billingCycle: req.body?.billingCycle,
  });

  try {
    const provider = getPaymentProvider();

    logger.info('createOrder provider', {
      requestId: req.id,
      name: provider?.constructor?.name,
      isRazorpay: provider instanceof RazorpayPaymentProvider,
      envProvider: process.env.PAYMENT_PROVIDER,
    });

    if (!(provider instanceof RazorpayPaymentProvider)) {
      throw ApiError.badRequest('Order creation is only available with the Razorpay payment provider');
    }

    const { plan, billingCycle = 'monthly' } = req.body;
    const planDefinition = getPlanDefinition(plan);

    if (!planDefinition) {
      throw ApiError.badRequest(`Unknown plan: ${plan}`);
    }

    const amountCents =
      billingCycle === 'yearly' ? planDefinition.priceYearlyCents : planDefinition.priceMonthlyCents;

    if (amountCents === 0) {
      throw ApiError.badRequest('Free plan does not require payment');
    }

    const order = await provider.createOrder({
      userId: req.user._id,
      planId: plan,
      billingCycle,
      amountCents,
    });

    await Payment.create({
      user: req.user._id,
      amount: amountCents,
      currency: 'INR',
      provider: 'razorpay',
      status: PAYMENT_STATUS.PENDING,
      providerSessionId: order.orderId,
      invoiceUrl: JSON.stringify({ planId: plan, billingCycle }),
    });

    // Safer key access — avoids depending on SDK internals
    const keyId = provider._keyId || provider.razorpay?.key_id;

    sendSuccess(res, {
      message: 'Order created',
      data: {
        orderId: order.orderId,
        amount: order.amount,
        currency: order.currency,
        keyId,
      },
    });
  } catch (err) {
    // Force the real error into the logs
    logger.error('createOrder failed', {
      requestId: req.id,
      message: err?.message,
      name: err?.name,
      statusCode: err?.statusCode,
      description: err?.error?.description || err?.description,
      stack: err?.stack,
      raw: JSON.stringify(err, Object.getOwnPropertyNames(err)),
    });
    throw err; // let the normal error handler respond
  }
});
