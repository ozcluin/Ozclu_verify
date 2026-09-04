/**
 * External API: UK Court Records Check
 * POST /api/v1/external/verify/uk-court
 */

import { NextRequest } from "next/server";
import { processExternalApiRequest, generateVerificationId, formatDateForVerification } from "src/lib/externalApiHelpers";

export async function POST(req: NextRequest) {
  return processExternalApiRequest(req, "uk_court", async (db, auth, body) => {
    const { candidateName, candidateDob, birthCity, judgmentType, jurisdiction, requestingOrgName } = body;

    if (!candidateName?.trim()) {
      return { data: { error: "candidateName is required" }, statusCode: 400 };
    }

    const orgName = auth.org.name;
    const finalId = await generateVerificationId(db, "UKC");

    await db.collection("verifications").insertOne({
      id: finalId,
      name: candidateName.trim(),
      email: "",
      orgName,
      requestingOrgName: requestingOrgName?.trim() || orgName,
      date: formatDateForVerification(),
      status: "Processing",
      verifier: "System",
      notes: "UK Court Check initiated via API. Searching Courts and Tribunals Judiciary...",
      type: "uk_court",
      candidateDob: candidateDob || "",
      birthCity: birthCity?.trim() || "",
      judgmentType: judgmentType || "",
      jurisdiction: jurisdiction || "",
      ukCourtStatus: "searching",
      ukCourtHasRecords: false,
      ukCourtResults: [],
      ukCourtTotalResults: 0,
      ukCourtTotalAvailable: 0,
      ukCourtCompletedAt: null,
      source: "api",
      createdAt: new Date().toISOString(),
    });

    // Fire-and-forget: trigger UK Court search
    const baseUrl = req.nextUrl.origin || process.env.NEXTAUTH_URL || "http://localhost:3000";
    fetch(`${baseUrl}/api/uk-court-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-api-key": process.env.NEXTAUTH_SECRET || "",
      },
      body: JSON.stringify({
        verificationId: finalId,
        candidateName: candidateName.trim(),
        judgmentType: judgmentType || "",
        jurisdiction: jurisdiction || "",
      }),
    }).catch((err) => {
      console.error(`[UK_COURT_API] Failed to trigger search for ${finalId}:`, err.message);
    });

    return {
      data: {
        success: true,
        requestId: finalId,
        status: "processing",
        message: "UK Court check initiated. Results will be available via the status endpoint.",
      },
    };
  });
}
