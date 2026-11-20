import type { Prisma } from '@docversity/database';

/**
 * Closes the open Razorpay orders of obligations that can no longer be paid online (manual
 * submission, void, application cancelled, expiry). RESERVED orders become CREATE_FAILED and CREATED
 * ones ABANDONED, each with an event; a later capture against them is a flagged refund candidate.
 * Runs inside the caller's transaction, which already holds the obligation row.
 */
export async function abandonOpenRazorpayOrders(
  tx: Prisma.TransactionClient,
  where: Prisma.RazorpayOrderWhereInput,
  reason: string,
): Promise<number> {
  const open = await tx.razorpayOrder.findMany({
    where: { ...where, status: { in: ['RESERVED', 'CREATED'] } },
    select: { id: true, status: true },
  });
  for (const order of open) {
    const created = order.status === 'CREATED';
    await tx.razorpayOrder.update({
      where: { id: order.id },
      data: { status: created ? 'ABANDONED' : 'CREATE_FAILED', createLeaseUntil: null },
    });
    await tx.razorpayOrderEvent.create({
      data: { orderId: order.id, kind: created ? 'ABANDONED' : 'CREATE_FAILED', reason },
    });
  }
  return open.length;
}
