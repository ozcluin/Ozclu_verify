import { NextRequest, NextResponse } from "next/server";
import { getDistrictsLocal } from "src/lib/courts-data";

/**
 * GET /api/ecourts-districts?state_code=26
 * 
 * Returns the list of districts for a given Indian state from the
 * pre-scraped courts database. Instant — no live API call needed.
 */
export async function GET(req: NextRequest) {
  try {
    const stateCode = req.nextUrl.searchParams.get("state_code");

    if (!stateCode) {
      return NextResponse.json(
        { error: "Missing required parameter: state_code" },
        { status: 400 }
      );
    }

    const districts = getDistrictsLocal(stateCode);

    return NextResponse.json({
      success: true,
      state_code: stateCode,
      districts,
    });
  } catch (error: any) {
    console.error("[ECOURTS-DISTRICTS] Error:", error.message);
    return NextResponse.json(
      { error: `Failed to fetch districts: ${error.message}` },
      { status: 500 }
    );
  }
}
