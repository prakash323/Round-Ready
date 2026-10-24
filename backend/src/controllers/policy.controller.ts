import { Types } from "mongoose";
import { BatchPolicy } from "../models/BatchPolicy";
import { DEFAULT_MULTIPLIERS } from "../lib/repo";
import { sessionOf } from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/errorHandler";
import type { BatchPolicyInput } from "../lib/schemas";

/**
 * The batch's placement policy.
 *
 * Readable by everyone in the batch and writable only by its CDC officer. The
 * asymmetry is the point: a student is gated by this rule, so hiding it would
 * leave them reading "you need 13.5 LPA" with no way to see where 13.5 came
 * from. Being able to read a rule is not being able to change it.
 */

interface PolicyView {
  batchId: string;
  serviceMultiplier: number;
  productMultiplier: number;
  /** False when no officer has ever saved, so the client can say "standard". */
  configured: boolean;
  updatedAt: string | null;
}

export const getPolicy = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const doc = await BatchPolicy.findOne({ batchId: session.batchId }).lean();

  const policy: PolicyView = doc
    ? {
        batchId: session.batchId,
        serviceMultiplier: doc.serviceMultiplier,
        productMultiplier: doc.productMultiplier,
        configured: true,
        updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
      }
    : {
        batchId: session.batchId,
        serviceMultiplier: DEFAULT_MULTIPLIERS.service_based,
        productMultiplier: DEFAULT_MULTIPLIERS.product_based,
        configured: false,
        updatedAt: null,
      };

  res.json({ policy });
});

export const putPolicy = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const input = req.body as BatchPolicyInput;

  // Upsert on the batch, which the unique index makes safe under two officers
  // saving at the same moment: one wins, the other updates rather than
  // creating a second rule for the same students.
  const doc = await BatchPolicy.findOneAndUpdate(
    { batchId: session.batchId },
    {
      $set: {
        serviceMultiplier: input.serviceMultiplier,
        productMultiplier: input.productMultiplier,
        updatedBy: new Types.ObjectId(session.userId),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  res.json({
    policy: {
      batchId: session.batchId,
      serviceMultiplier: doc.serviceMultiplier,
      productMultiplier: doc.productMultiplier,
      configured: true,
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    } satisfies PolicyView,
  });
});
