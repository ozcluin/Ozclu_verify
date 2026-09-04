/**
 * External API: SAFLII South African Court Check
 * POST /api/v1/external/verify/saflii-court
 */

import { NextRequest } from "next/server";
import { processExternalApiRequest, generateVerificationId, formatDateForVerification } from "src/lib/externalApiHelpers";

export async function POST(req: NextRequest) {
  return processExternalApiRequest(req, "saflii_court", async (db, auth, body) => {
    const { candidateName, candidateDob, birthCity, requestingOrgName } = body;

    if (!candidateName?.trim()) {
      return { data: { error: "candidateName is required" }, statusCode: 400 };
    }

    const orgName = auth.org.name;
    const finalId = await generateVerificationId(db, "SAF");

    await db.collection("verifications").insertOne({
      id: finalId,
      name: candidateName.trim(),
      email: "",
      orgName,
      requestingOrgName: requestingOrgName?.trim() || orgName,
      date: formatDateForVerification(),
      status: "Processing",
      verifier: "System",
      notes: "SAFLII Court Check initiated via API. Search in progress...",
      type: "saflii_court",
      candidateDob: candidateDob || "",
      birthCity: birthCity?.trim() || "",
      safliiCourtStatus: "searching",
      safliiCourtHasRecords: false,
      safliiCourtResults: [],
      source: "api",
      createdAt: new Date().toISOString(),
    });

    // Fire-and-forget: trigger SAFLII search
    const baseUrl = req.nextUrl.origin || process.env.NEXTAUTH_URL || "http://localhost:3000";
    fetch(`${baseUrl}/api/saflii-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-api-key": process.env.NEXTAUTH_SECRET || "" },
      body: JSON.stringify({ verificationId: finalId, candidateName: candidateName.trim() }),
    }).catch((err) => console.error(`[SAFLII_API] Failed to trigger for ${finalId}:`, err.message));

    return {
      data: {
        success: true,
        requestId: finalId,
        status: "processing",
        message: "SAFLII Court check initiated. Results will be available via the status endpoint.",
      },
    };
  });
}
