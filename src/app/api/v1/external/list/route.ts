/**
 * External API: List Verifications
 * GET /api/v1/external/list
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey, isApiAuthError } from "src/lib/externalApiAuth";
import { applyRateLimit, rateLimitHeaders } from "src/lib/apiRateLimit";
import { connectToDatabase } from "src/lib/mongodb";
import { logApiUsage } from "src/lib/apiUsageLog";
import { sanitizeVerification } from "src/lib/apiAuth";

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const authResult = await authenticateApiKey(req);
  if (isApiAuthError(authResult)) return authResult;

  const rateLimitError = applyRateLimit(authResult.apiKey._id, authResult.apiKey.rateLimit);
  if (rateLimitError) return rateLimitError;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const statusFilter = searchParams.get("status");
  const typeFilter = searchParams.get("type");

  const { db } = await connectToDatabase();
  const orgNameRegex = new RegExp(`^${authResult.org.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")}$`, "i");

  const query: any = {
    orgName: { $regex: orgNameRegex },
    isDeleted: { $ne: true },
  };

  if (statusFilter) {
    query.status = statusFilter;
  }
  if (typeFilter) {
    query.type = typeFilter;
  }

  const skip = (page - 1) * limit;
  const [totalCount, docs] = await Promise.all([
    db.collection("verifications").countDocuments(query),
    db.collection("verifications")
      .find(query)
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
  ]);

  const sanitizedList = docs.map((doc) => {
    const clean = sanitizeVerification(doc);
    if (clean._id) clean._id = clean._id.toString();
    return clean;
  });

  const responseData = {
    success: true,
    page,
    limit,
    total: totalCount,
    totalPages: Math.ceil(totalCount / limit),
    verifications: sanitizedList,
  };

  logApiUsage(db, {
    orgId: authResult.org.id,
    orgName: authResult.org.name,
    apiKeyId: authResult.apiKey._id,
    keySuffix: authResult.apiKey.keySuffix,
    endpoint: req.nextUrl.pathname,
    checkType: "list_verifications",
    method: "GET",
    statusCode: 200,
    cost: 0,
    currency: authResult.org.currency || "USD",
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown",
    requestId: "",
    timestamp: new Date(),
    responseTimeMs: Date.now() - startTime,
  }).catch(() => {});

  return NextResponse.json(responseData, {
    status: 200,
    headers: rateLimitHeaders(authResult.apiKey._id, authResult.apiKey.rateLimit),
  });
}
