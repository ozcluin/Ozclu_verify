/**
 * External API: Get Verification Report
 * GET /api/v1/external/report/[requestId]
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey, isApiAuthError } from "src/lib/externalApiAuth";
import { applyRateLimit, rateLimitHeaders } from "src/lib/apiRateLimit";
import { connectToDatabase } from "src/lib/mongodb";
import { logApiUsage } from "src/lib/apiUsageLog";
import { sanitizeVerification } from "src/lib/apiAuth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const startTime = Date.now();
  const authResult = await authenticateApiKey(req);
  if (isApiAuthError(authResult)) return authResult;

  const rateLimitError = applyRateLimit(authResult.apiKey._id, authResult.apiKey.rateLimit);
  if (rateLimitError) return rateLimitError;

  const { requestId } = await params;
  if (!requestId) {
    return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  const orgNameRegex = new RegExp(`^${authResult.org.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")}$`, "i");

  const verification = await db.collection("verifications").findOne({
    id: requestId,
    orgName: { $regex: orgNameRegex },
    isDeleted: { $ne: true },
  });

  if (!verification) {
    return NextResponse.json(
      { error: "Verification record not found or does not belong to your organisation" },
      { status: 404, headers: rateLimitHeaders(authResult.apiKey._id, authResult.apiKey.rateLimit) }
    );
  }

  // Check if verification is completed
  const isCompleted =
    verification.status === "Completed" ||
    verification.status === "Verified" ||
    verification.status === "Discrepancy" ||
    verification.courtRecordStatus === "completed" ||
    verification.safliiCourtStatus === "completed" ||
    verification.ukCourtStatus === "completed" ||
    verification.malaysiaCourtStatus === "completed" ||
    verification.sapsWantedStatus === "completed" ||
    verification.sapsWantedStatus === "cleared_by_attorney" ||
    verification.sapsWantedStatus === "confirmed_wanted" ||
    verification.passportStatus === "completed" ||
    Boolean(verification.interpolCompletedAt) ||
    Boolean(verification.rednoticeWorldwideCompletedAt);

  if (!isCompleted) {
    return NextResponse.json(
      {
        success: false,
        requestId: verification.id,
        status: verification.status,
        message: "Verification report is not yet ready. Current status: " + verification.status,
      },
      { status: 200, headers: rateLimitHeaders(authResult.apiKey._id, authResult.apiKey.rateLimit) }
    );
  }

  const cleanDoc = sanitizeVerification(verification);
  if (cleanDoc._id) {
    cleanDoc._id = cleanDoc._id.toString();
  }

  const responseData = {
    success: true,
    requestId: verification.id,
    type: verification.type || "identity",
    status: verification.status,
    candidateName: verification.name,
    report: cleanDoc,
  };

  logApiUsage(db, {
    orgId: authResult.org.id,
    orgName: authResult.org.name,
    apiKeyId: authResult.apiKey._id,
    keySuffix: authResult.apiKey.keySuffix,
    endpoint: req.nextUrl.pathname,
    checkType: verification.type || "report_fetch",
    method: "GET",
    statusCode: 200,
    cost: 0,
    currency: authResult.org.currency || "USD",
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown",
    requestId,
    timestamp: new Date(),
    responseTimeMs: Date.now() - startTime,
  }).catch(() => {});

  return NextResponse.json(responseData, {
    status: 200,
    headers: rateLimitHeaders(authResult.apiKey._id, authResult.apiKey.rateLimit),
  });
}
