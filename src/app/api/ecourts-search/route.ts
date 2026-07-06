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
 * This is a long-running endpoint — it may take 30-120 seconds depending on
 * how many complexes need to be searched.
 * 
 * Body: { verificationId, candidateName, addresses }
 */
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

    // Get ONE session upfront — reuse for all searches to avoid "socket hang up"
    let sessionCookies: SessionCookies;
    try {
      sessionCookies = await getSession();
      console.log(`[ECOURTS] Session obtained for verification ${verificationId}`);
    } catch (sessionErr: any) {
      // If session fails, mark verification as error and return
      await db.collection("verifications").updateOne(
        { id: verificationId },
        {
          $set: {
            status: "Needs Attention",
            courtRecordStatus: "error",
            courtRecordSummary: "Failed to connect to eCourts",
            courtRecordErrors: [`Session error: ${sessionErr.message}`],
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
          // Check if this complex has establishments in our local database
          if (complex.hasEstablishments) {
            const establishments = getEstablishmentsLocal(stateCode, matchedDistrictCode, complex.code);

            if (establishments && establishments.length > 0) {
              // Loop and search each establishment individually
              for (const est of establishments) {
                totalComplexesSearched++;

                const currentYear = new Date().getFullYear();
                const yearsToSearch = Array.from({ length: 5 }, (_, idx) => String(currentYear - idx));

                let aggregatedCases: any[] = [];
                let searchErrorOccurred = false;
                let searchErrorMessage = "";

                for (const year of yearsToSearch) {
                  try {
                    // Use session-reusing search with automatic retry
                    const { result: searchResult, cookies: updatedCookies } = await searchCourtOrdersWithSession({
                      partyName: candidateName,
                      year,
                      orderType: "both",
                      stateCode,
                      distCode: matchedDistrictCode,
                      courtComplex: complex.code,
                      courtComplexArr: complex.arr,
                      estCode: est.value, // Pass individual establishment code
                      cookies: sessionCookies,
                      maxRetries: 2,
                    });

                    // Update session cookies in case they were renewed during retry
                    sessionCookies = updatedCookies;

                    if (searchResult.cases && searchResult.cases.length > 0) {
                      aggregatedCases.push(...searchResult.cases.map((c) => ({
                        caseNumber: c.caseNumber,
                        petitioner: c.petitioner,
                        respondent: c.respondent,
                        orderDate: c.orderDate,
                      })));
                    }

                    // Small politeness delay between year queries
                    await delay(250);
                  } catch (searchError: any) {
                    searchErrorOccurred = true;
                    searchErrorMessage = searchError.message || "Search failed";
                    break;
                  }
                }

                if (searchErrorOccurred) {
                  addressResult.complexSearches.push({
                    complexName: complex.name,
                    complexCode: complex.code,
                    establishmentName: est.name,
                    establishmentCode: est.value,
                    casesFound: 0,
                    cases: [],
                    error: searchErrorMessage,
                  });
                } else {
                  addressResult.complexSearches.push({
                    complexName: complex.name,
                    complexCode: complex.code,
                    establishmentName: est.name,
                    establishmentCode: est.value,
                    casesFound: aggregatedCases.length,
                    cases: aggregatedCases,
                  });
                  totalCasesFound += aggregatedCases.length;
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
              continue; // proceed to next complex
            }
          }

          // Fallback / standard path for complexes with no establishments
          totalComplexesSearched++;

          const currentYear = new Date().getFullYear();
          const yearsToSearch = Array.from({ length: 5 }, (_, idx) => String(currentYear - idx));

          let aggregatedCases: any[] = [];
          let searchErrorOccurred = false;
          let searchErrorMessage = "";

          for (const year of yearsToSearch) {
            try {
              // Use session-reusing search with automatic retry
              const { result: searchResult, cookies: updatedCookies } = await searchCourtOrdersWithSession({
                partyName: candidateName,
                year,
                orderType: "both",
                stateCode,
                distCode: matchedDistrictCode,
                courtComplex: complex.code,
                courtComplexArr: complex.arr,
                estCode: "", // no establishment
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

              // Small politeness delay between year queries
              await delay(250);
            } catch (searchError: any) {
              searchErrorOccurred = true;
              searchErrorMessage = searchError.message || "Search failed";
              break;
            }
          }

          if (searchErrorOccurred) {
            addressResult.complexSearches.push({
              complexName: complex.name,
              complexCode: complex.code,
              casesFound: 0,
              cases: [],
              error: searchErrorMessage,
            });
          } else {
            addressResult.complexSearches.push({
              complexName: complex.name,
              complexCode: complex.code,
              casesFound: aggregatedCases.length,
              cases: aggregatedCases,
            });
            totalCasesFound += aggregatedCases.length;
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
      } catch (stateError: any) {
        errors.push(
          `Address ${i + 1}: Error processing state "${stateName}": ${stateError.message}`
        );
      }
    }

    // Determine final status and summary
    const hasResults = totalCasesFound > 0;
    const courtRecordSummary = hasResults
      ? `${totalCasesFound} court record(s) found across ${totalComplexesSearched} court complexes`
      : `No court records found across ${totalComplexesSearched} court complexes`;

    const finalStatus = errors.length > 0 && allResults.length === 0 
      ? "error" 
      : "completed";

    const verificationStatus = finalStatus === "error" 
      ? "Needs Attention" 
      : "Completed";

    // Update the verification document with results
    await db.collection("verifications").updateOne(
      { id: verificationId },
      {
        $set: {
          courtRecordResults: allResults,
          courtRecordSummary,
          courtRecordStatus: finalStatus,
          courtRecordErrors: errors.length > 0 ? errors : undefined,
          courtRecordTotalCases: totalCasesFound,
          courtRecordTotalComplexes: totalComplexesSearched,
          courtRecordCompletedAt: new Date().toISOString(),
          courtRecordHasRecords: hasResults,
          status: verificationStatus,
          completedAt: new Date().toISOString(),
          reportDetails: hasResults
            ? `Court record search completed. ${totalCasesFound} record(s) found across ${totalComplexesSearched} court complexes.`
            : `Court record search completed. No records found across ${totalComplexesSearched} court complexes.`,
        },
      }
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
