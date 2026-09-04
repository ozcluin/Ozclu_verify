/**
 * External API: Malaysia Court Records Check
 * POST /api/v1/external/verify/malaysia-court
 */

import { NextRequest } from "next/server";
import { processExternalApiRequest, generateVerificationId, formatDateForVerification } from "src/lib/externalApiHelpers";

export async function POST(req: NextRequest) {
  return processExternalApiRequest(req, "malaysia_court", async (db, auth, body) => {
    const {
      candidateName,
      candidateDob,
      courtCategory,
      courtLocation,
      caseType,
      dateOfDecisionFrom,
      dateOfDecisionTo,
      dateOfAPFrom,
      dateOfAPTo,
      judgeName,
      requestingOrgName,
    } = body;

    if (!candidateName?.trim()) {
      return { data: { error: "candidateName is required" }, statusCode: 400 };
    }

    const orgName = auth.org.name;
    const finalId = await generateVerificationId(db, "MYC");

    await db.collection("verifications").insertOne({
      id: finalId,
      name: candidateName.trim(),
      email: "",
      orgName,
      requestingOrgName: requestingOrgName?.trim() || orgName,
      date: formatDateForVerification(),
      status: "Processing",
      verifier: "System",
      notes: "Malaysia Court Check initiated via API. Searching Portal eJudgment Mahkamah Persekutuan Malaysia...",
      type: "malaysia_court",
      candidateDob: candidateDob || "",
      courtCategory: courtCategory || "",
      courtLocation: courtLocation || "",
      caseType: caseType || "",
      dateOfDecisionFrom: dateOfDecisionFrom || "",
      dateOfDecisionTo: dateOfDecisionTo || "",
      dateOfAPFrom: dateOfAPFrom || "",
      dateOfAPTo: dateOfAPTo || "",
      judgeName: judgeName?.trim() || "",
      malaysiaCourtStatus: "searching",
      malaysiaCourtHasRecords: false,
      malaysiaCourtResults: [],
      malaysiaCourtTotalResults: 0,
      malaysiaCourtTotalAvailable: 0,
      malaysiaCourtCompletedAt: null,
      source: "api",
      createdAt: new Date().toISOString(),
    });

    // Fire-and-forget: trigger Malaysia Court search
    const baseUrl = req.nextUrl.origin || process.env.NEXTAUTH_URL || "http://localhost:3000";
    fetch(`${baseUrl}/api/malaysia-court-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-api-key": process.env.NEXTAUTH_SECRET || "",
      },
      body: JSON.stringify({
        verificationId: finalId,
        candidateName: candidateName.trim(),
        courtCategory: courtCategory || "",
        courtLocation: courtLocation || "",
        caseType: caseType || "",
        dateOfDecisionFrom: dateOfDecisionFrom || "",
        dateOfDecisionTo: dateOfDecisionTo || "",
        dateOfAPFrom: dateOfAPFrom || "",
        dateOfAPTo: dateOfAPTo || "",
        judgeName: judgeName?.trim() || "",
      }),
    }).catch((err) => {
      console.error(`[MALAYSIA_COURT_API] Failed to trigger search for ${finalId}:`, err.message);
    });

    return {
      data: {
        success: true,
        requestId: finalId,
        status: "processing",
        message: "Malaysia Court check initiated. Results will be available via the status endpoint.",
      },
    };
  });
}
