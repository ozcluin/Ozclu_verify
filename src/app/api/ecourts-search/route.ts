import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, isErrorResponse } from "src/lib/apiAuth";
import { connectToDatabase } from "src/lib/mongodb";
import {
  getSession,
  searchCourtOrdersWithSession,
  delay,
} from "src/lib/ecourts-api";
import type { SessionCookies } from "src/lib/ecourts-api";
import { resolveStateCode, getStateName } from "src/lib/courts-mapping";
import { getDistrictsLocal, getCourtComplexesLocal, getEstablishmentsLocal } from "src/lib/courts-data";

/**
 * POST /api/ecourts-search
 * 
 * Runs a court record search across all court complexes in the given districts.
 * Includes global timeout (3 min), per-establishment timeout, and smart skip logic.
 * 
 * Body: { verificationId, candidateName, addresses }
 */

// ─── Configurable Search Parameters ───
const GLOBAL_TIMEOUT_MS = 3 * 60 * 1000;          // 3 minutes max for entire search
const DEFAULT_YEARS_BACK = 3;                       // Fallback: search current year + 2 prior
const PER_ESTABLISHMENT_TIMEOUT_MS = 45_000;        // 45s max per establishment (all years combined)
const MAX_CONSECUTIVE_FAILURES = 3;                 // Skip remaining establishments after 3 consecutive failures
export async function POST(req: NextRequest) {
  try {
    // Auth check — require client or admin session
    const authResult = await requireAuth();
    if (isErrorResponse(authResult)) return authResult;
    const { user } = authResult;

    const roleError = requireRole(user, ["client", "org_owner", "admin"]);
    if (roleError) return roleError;

    const body = await req.json();
    const { verificationId, candidateName, addresses } = body;

    if (!verificationId || !candidateName || !addresses || !Array.isArray(addresses)) {
      return NextResponse.json(
        { error: "Missing required fields: verificationId, candidateName, addresses" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    // Update verification to show search is in progress
    await db.collection("verifications").updateOne(
      { id: verificationId },
      {
        $set: {
          courtRecordStatus: "searching",
          courtRecordSearchStartedAt: new Date().toISOString(),
        },
      }
    );

    // Process each address — resolve city/state to eCourts codes and search
    const allResults: Array<{
      addressIndex: number;
      address: string;
      city: string;
      state: string;
      stateCode: string;
      district: string;
      districtCode: string;
      complexSearches: Array<{
        complexName: string;
        complexCode: string;
        casesFound: number;
        cases: Array<{
          caseNumber: string;
          petitioner: string;
          respondent: string;
          orderDate: string;
        }>;
        error?: string;
      }>;
    }> = [];

    const errors: string[] = [];
    let totalCasesFound = 0;
    let totalComplexesSearched = 0;
    const globalStartTime = Date.now();
    let globalTimedOut = false;

    // Get ONE session upfront — reuse for all searches to avoid "socket hang up"
    let sessionCookies: SessionCookies;
    try {
      sessionCookies = await getSession();
      console.log(`[ECOURTS] Session obtained for verification ${verificationId}`);
    } catch (sessionErr: any) {
      // If session fails after all retries, mark verification as error and return
      console.error(`[ECOURTS] Session failed for verification ${verificationId} after ${3} retries: ${sessionErr.message}`);
      await db.collection("verifications").updateOne(
        { id: verificationId },
        {
          $set: {
            status: "Needs Attention",
            courtRecordStatus: "error",
            courtRecordSummary: `Failed to connect to eCourts after ${3} attempts — ${sessionErr.message}`,
            courtRecordErrors: [`Session error (${3} retries exhausted): ${sessionErr.message}`],
            completedAt: new Date().toISOString(),
          },
        }
      );
      return NextResponse.json({ error: "Failed to obtain eCourts session" }, { status: 500 });
    }

    for (let i = 0; i < addresses.length; i++) {
      const addr = addresses[i];
      const cityName = addr.city?.trim();
      const stateName = addr.state?.trim();
      const providedStateCode = addr.stateCode?.trim();
      const providedDistrictCode = addr.districtCode?.trim();

      // Per-address year range (fallback to current year - 2 → current year)
      const fallbackCurrentYear = new Date().getFullYear();
      const addrToYear = (typeof addr.toYear === "number" && addr.toYear >= 2015 && addr.toYear <= fallbackCurrentYear)
        ? addr.toYear : fallbackCurrentYear;
      const addrFromYear = (typeof addr.fromYear === "number" && addr.fromYear >= 2015 && addr.fromYear <= addrToYear)
        ? addr.fromYear : Math.max(addrToYear - DEFAULT_YEARS_BACK + 1, 2015);
      const addrYearsToSearch = Array.from(
        { length: addrToYear - addrFromYear + 1 },
        (_, idx) => String(addrToYear - idx)
      );

      if (!stateName) {
        errors.push(`Address ${i + 1}: No state provided`);
        continue;
      }

      // Resolve state code — use provided stateCode if available, otherwise resolve from name
      const stateCode = providedStateCode || resolveStateCode(stateName);
      if (!stateCode) {
        errors.push(`Address ${i + 1}: Could not resolve state "${stateName}" to an eCourts code`);
        continue;
      }

      try {
        let matchedDistrictName = cityName || "";
        let matchedDistrictCode = providedDistrictCode || "";

        // If districtCode is already provided from the dropdown, skip the fuzzy lookup
        if (matchedDistrictCode) {
          // We already have the exact district code from the dropdown — no API call needed
        } else {
          // Legacy path: resolve district by city name (using local data)
          const districts = getDistrictsLocal(stateCode);

          if (!districts || districts.length === 0) {
            errors.push(`Address ${i + 1}: No districts found for state "${stateName}"`);
            continue;
          }

          // Find the matching district by city name
          const cityLower = cityName?.toLowerCase() || "";
          let matchedDistrict = districts.find(
            (d) => d.name.toLowerCase() === cityLower
          );

          // Partial match fallback
          if (!matchedDistrict) {
            matchedDistrict = districts.find(
              (d) =>
                d.name.toLowerCase().includes(cityLower) ||
                cityLower.includes(d.name.toLowerCase())
            );
          }

          if (!matchedDistrict && districts.length > 0) {
            const possibleMatches = districts.filter(
              (d) =>
                d.name.toLowerCase().includes(cityLower) ||
                cityLower.includes(d.name.toLowerCase())
            );
            if (possibleMatches.length > 0) {
              matchedDistrict = possibleMatches[0];
            } else {
              errors.push(
                `Address ${i + 1}: City "${cityName}" not found as a district in "${stateName}". Available districts: ${districts.map((d) => d.name).join(", ")}`
              );
              continue;
            }
          }

          if (!matchedDistrict) continue;
          matchedDistrictName = matchedDistrict.name;
          matchedDistrictCode = matchedDistrict.value;
        }

        // Get all court complexes for this district (local lookup — instant)
        const complexes = getCourtComplexesLocal(stateCode, matchedDistrictCode);

        if (!complexes || complexes.length === 0) {
          errors.push(
            `Address ${i + 1}: No court complexes found in district "${matchedDistrictName}"`
          );
          continue;
        }

        const addressResult = {
          addressIndex: i,
          address: addr.address || "",
          city: cityName || "",
          state: getStateName(stateCode),
          stateCode,
          district: matchedDistrictName,
          districtCode: matchedDistrictCode,
          complexSearches: [] as Array<{
            complexName: string;
            complexCode: string;
            establishmentName?: string;
            establishmentCode?: string;
            casesFound: number;
            cases: Array<{
              caseNumber: string;
              petitioner: string;
              respondent: string;
              orderDate: string;
            }>;
            error?: string;
          }>,
        };

        // Search each court complex
        for (const complex of complexes) {
          // ── Global timeout check ──
          if (Date.now() - globalStartTime > GLOBAL_TIMEOUT_MS) {
            globalTimedOut = true;
            errors.push(`Global timeout reached (${GLOBAL_TIMEOUT_MS / 1000}s). Search completed with partial results.`);
            console.log(`[ECOURTS] Global timeout for ${verificationId} after ${totalComplexesSearched} establishments`);
            break;
          }

          // Check if this complex has establishments in our local database
          if (complex.hasEstablishments) {
            const establishments = getEstablishmentsLocal(stateCode, matchedDistrictCode, complex.code);

            if (establishments && establishments.length > 0) {
              let consecutiveFailures = 0;

              // Loop and search each establishment individually
              for (const est of establishments) {
                // ── Global timeout check (inner loop) ──
                if (Date.now() - globalStartTime > GLOBAL_TIMEOUT_MS) {
                  globalTimedOut = true;
                  errors.push(`Global timeout reached during ${complex.name}. Partial results saved.`);
                  break;
                }

                // ── Skip remaining if too many consecutive failures ──
                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                  const remaining = establishments.length - establishments.indexOf(est);
                  errors.push(`Skipped ${remaining} remaining establishments in ${complex.name} after ${MAX_CONSECUTIVE_FAILURES} consecutive failures.`);
                  break;
                }

                totalComplexesSearched++;

                const yearsToSearch = addrYearsToSearch;

                // ── Per-establishment timeout wrapper ──
                const estSearchPromise = (async () => {
                  let aggregatedCases: any[] = [];

                  for (const year of yearsToSearch) {
                    // Use session-reusing search with automatic retry
                    const { result: searchResult, cookies: updatedCookies } = await searchCourtOrdersWithSession({
                      partyName: candidateName,
                      year,
                      orderType: "both",
                      stateCode,
                      distCode: matchedDistrictCode,
                      courtComplex: complex.code,
                      courtComplexArr: complex.arr,
                      estCode: est.value,
                      cookies: sessionCookies,
                      maxRetries: 2,
                    });

                    sessionCookies = updatedCookies;

                    if (searchResult.cases && searchResult.cases.length > 0) {
                      aggregatedCases.push(...searchResult.cases.map((c) => ({
                        caseNumber: c.caseNumber,
                        petitioner: c.petitioner,
                        respondent: c.respondent,
                        orderDate: c.orderDate,
                      })));
                    }

                    await delay(250);
                  }

                  return aggregatedCases;
                })();

                // Race the establishment search against a timeout
                const timeoutPromise = new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error(`Establishment search timed out after ${PER_ESTABLISHMENT_TIMEOUT_MS / 1000}s`)), PER_ESTABLISHMENT_TIMEOUT_MS)
                );

                try {
                  const aggregatedCases = await Promise.race([estSearchPromise, timeoutPromise]);

                  consecutiveFailures = 0; // Reset on success

                  addressResult.complexSearches.push({
                    complexName: complex.name,
                    complexCode: complex.code,
                    establishmentName: est.name,
                    establishmentCode: est.value,
                    casesFound: aggregatedCases.length,
                    cases: aggregatedCases,
                  });
                  totalCasesFound += aggregatedCases.length;
                } catch (searchError: any) {
                  consecutiveFailures++;

                  const errorMsg = (searchError as any).isDataVolume
                    ? `Data volume issue: too many results for this name`
                    : searchError.message || "Search failed";

                  addressResult.complexSearches.push({
                    complexName: complex.name,
                    complexCode: complex.code,
                    establishmentName: est.name,
                    establishmentCode: est.value,
                    casesFound: 0,
                    cases: [],
                    error: errorMsg,
                  });
                }

                // Update progress in DB after each establishment search
                await db.collection("verifications").updateOne(
                  { id: verificationId },
                  {
                    $set: {
                      courtRecordProgress: `Searched ${totalComplexesSearched} establishments/complexes, found ${totalCasesFound} cases`,
                    },
                  }
                );

                // Politeness delay between requests (500ms to avoid eCourts rate limiting)
                await delay(500);
              }

              if (globalTimedOut) break;
              continue; // proceed to next complex
            }
          }

          totalComplexesSearched++;

          const yearsToSearch = addrYearsToSearch;

          // ── Per-complex timeout wrapper ──
          const complexSearchPromise = (async () => {
            let aggregatedCases: any[] = [];

            for (const year of yearsToSearch) {
              const { result: searchResult, cookies: updatedCookies } = await searchCourtOrdersWithSession({
                partyName: candidateName,
                year,
                orderType: "both",
                stateCode,
                distCode: matchedDistrictCode,
                courtComplex: complex.code,
                courtComplexArr: complex.arr,
                estCode: "",
                cookies: sessionCookies,
                maxRetries: 2,
              });

              sessionCookies = updatedCookies;

              if (searchResult.cases && searchResult.cases.length > 0) {
                aggregatedCases.push(...searchResult.cases.map((c) => ({
                  caseNumber: c.caseNumber,
                  petitioner: c.petitioner,
                  respondent: c.respondent,
                  orderDate: c.orderDate,
                })));
              }

              await delay(250);
            }

            return aggregatedCases;
          })();

          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Complex search timed out after ${PER_ESTABLISHMENT_TIMEOUT_MS / 1000}s`)), PER_ESTABLISHMENT_TIMEOUT_MS)
          );

          try {
            const aggregatedCases = await Promise.race([complexSearchPromise, timeoutPromise]);

            addressResult.complexSearches.push({
              complexName: complex.name,
              complexCode: complex.code,
              casesFound: aggregatedCases.length,
              cases: aggregatedCases,
            });
            totalCasesFound += aggregatedCases.length;
          } catch (searchError: any) {
            const errorMsg = (searchError as any).isDataVolume
              ? `Data volume issue: too many results for this name`
              : searchError.message || "Search failed";

            addressResult.complexSearches.push({
              complexName: complex.name,
              complexCode: complex.code,
              casesFound: 0,
              cases: [],
              error: errorMsg,
            });
          }

          // Update progress in DB after each complex
          await db.collection("verifications").updateOne(
            { id: verificationId },
            {
              $set: {
                courtRecordProgress: `Searched ${totalComplexesSearched} establishments/complexes, found ${totalCasesFound} cases`,
              },
            }
          );

          // Politeness delay between requests
          await delay(500);
        }

        allResults.push(addressResult);

        if (globalTimedOut) break;
      } catch (stateError: any) {
        errors.push(
          `Address ${i + 1}: Error processing state "${stateName}": ${stateError.message}`
        );
      }
    }

    // Determine final status and summary
    const hasResults = totalCasesFound > 0;
    const searchDuration = Math.round((Date.now() - globalStartTime) / 1000);
    const courtRecordSummary = hasResults
      ? `${totalCasesFound} court record(s) found across ${totalComplexesSearched} court complexes in ${searchDuration}s${globalTimedOut ? " (partial — timed out)" : ""}`
      : `No court records found across ${totalComplexesSearched} court complexes in ${searchDuration}s${globalTimedOut ? " (partial — timed out)" : ""}`;

    const finalStatus = (errors.length > 0 && allResults.length === 0)
      ? "error" 
      : hasResults
        ? "admin_review"   // Records found → route to admin for manual review
        : "completed";     // No records → auto-complete

    const verificationStatus = finalStatus === "error" 
      ? "Needs Attention" 
      : finalStatus === "admin_review"
        ? "Processing"      // Stay within allowed union; UI reads courtRecordStatus for review state
        : "Completed";

    // Build the update document
    const updateDoc: Record<string, any> = {
      courtRecordResults: allResults,
      courtRecordSummary,
      courtRecordStatus: finalStatus,
      courtRecordErrors: errors.length > 0 ? errors : undefined,
      courtRecordTotalCases: totalCasesFound,
      courtRecordTotalComplexes: totalComplexesSearched,
      courtRecordCompletedAt: new Date().toISOString(),
      courtRecordHasRecords: hasResults,
      status: verificationStatus,
      reportDetails: hasResults
        ? `Court record search completed. ${totalCasesFound} record(s) found across ${totalComplexesSearched} court complexes. Pending admin review.`
        : `Court record search completed. No records found across ${totalComplexesSearched} court complexes.`,
    };

    // If records found → flag for admin review; if not → mark as fully completed
    if (hasResults) {
      updateDoc.courtRecordAdminReview = true;
      updateDoc.courtRecordAdminReviewStartedAt = new Date().toISOString();
    } else {
      updateDoc.completedAt = new Date().toISOString();
    }

    // Update the verification document with results
    await db.collection("verifications").updateOne(
      { id: verificationId },
      { $set: updateDoc }
    );

    return NextResponse.json({
      success: true,
      verificationId,
      summary: courtRecordSummary,
      totalCases: totalCasesFound,
      totalComplexes: totalComplexesSearched,
      resultsCount: allResults.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("[ECOURTS-SEARCH] Error:", error.message);

    // Try to update the verification with the error
    try {
      const body = await req.clone().json();
      if (body.verificationId) {
        const { db } = await connectToDatabase();
        await db.collection("verifications").updateOne(
          { id: body.verificationId },
          {
            $set: {
              courtRecordStatus: "error",
              courtRecordErrors: [error.message],
              status: "Needs Attention",
              notes: `Court record search failed: ${error.message}`,
            },
          }
        );
      }
    } catch {
      // Ignore secondary error
    }

    return NextResponse.json(
      { error: `Court record search failed: ${error.message}` },
      { status: 500 }
    );
  }
}
