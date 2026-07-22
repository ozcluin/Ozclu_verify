import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fileNumber, dateOfBirth, applicationType = 'passport' } = body;

    if (!fileNumber || !dateOfBirth) {
      return NextResponse.json(
        { error: 'File Number and Date of Birth are required.' },
        { status: 400 }
      );
    }

    // Convert date format from YYYY-MM-DD (HTML date input) or DD-MM-YYYY to DD/MM/YYYY
    let formattedDob = dateOfBirth.trim();
    if (formattedDob.includes('-')) {
      const parts = formattedDob.split('-');
      if (parts.length === 3) {
        // Check if format is YYYY-MM-DD or DD-MM-YYYY
        if (parts[0].length === 4) {
          formattedDob = `${parts[2]}/${parts[1]}/${parts[0]}`;
        } else {
          formattedDob = `${parts[0]}/${parts[1]}/${parts[2]}`;
        }
      }
    } else if (formattedDob.includes('.')) {
      formattedDob = formattedDob.replace(/\./g, '/');
    }

    // Map application type to exact Passport Seva API optStatus
    const optStatusMap: Record<string, string> = {
      passport: 'Application_Status',
      diplomatic: 'Diplomatic_Or_Official_Application_Status',
      surrender: 'SC_Status',
      rti: 'RTI_Status',
      appeal: 'Appeal_Status',
      // Direct exact optStatus string fallbacks if caller sends string directly
      Application_Status: 'Application_Status',
      Diplomatic_Or_Official_Application_Status: 'Diplomatic_Or_Official_Application_Status',
      SC_Status: 'SC_Status',
      RTI_Status: 'RTI_Status',
      Appeal_Status: 'Appeal_Status'
    };

    const optStatusValue = optStatusMap[applicationType] || 'Application_Status';

    const payload = {
      requestResponseMap: {
        fileNo: fileNumber.trim(),
        applDob: formattedDob,
        optStatus: optStatusValue
      }
    };

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin': 'https://www.passportindia.gov.in',
      'Referer': 'https://www.passportindia.gov.in/',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    };

    const apiUrl = 'https://api1.passportindia.gov.in/v1/online/trackStatusForFileNo';
    const apiRes = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!apiRes.ok) {
      const errorText = await apiRes.text();
      return NextResponse.json(
        { error: `Passport India service returned HTTP status ${apiRes.status}.`, details: errorText },
        { status: apiRes.status }
      );
    }

    const data = await apiRes.json();

    // Catch Passport API internal error signals
    if (data.strReturnString === 'error' || (data.fieldErrors && Object.keys(data.fieldErrors).length > 0)) {
      const fieldMsg = data.fieldErrors ? Object.values(data.fieldErrors).flat().join(', ') : '';
      return NextResponse.json(
        { error: fieldMsg || 'Invalid File Number or Date of Birth. Please verify your details.' },
        { status: 404 }
      );
    }

    const map = data.requestResponseMap || {};
    const appStatusObj =
      Array.isArray(map.applicationStatus) && map.applicationStatus.length > 0
        ? map.applicationStatus[0]
        : {};

    const responsePayload = {
      success: true,
      fileNumber: appStatusObj.FILE_NO || map.fileNo || fileNumber,
      dateOfBirth: appStatusObj.DATE_OF_BIRTH || map.applDob || formattedDob,
      givenName: appStatusObj.APPL_GIVEN_NAME || '—',
      surname: appStatusObj.APPL_SURNAME || '—',
      typeOfApplication: appStatusObj.PARAM_VALUE || 'Normal',
      applicationReceivedDate: appStatusObj.APP_SUB_DATE || '—',
      status: map.statusMessage || appStatusObj.STATUS_MESSAGE || 'Status Retrieved Successfully',
      optStatus: optStatusValue,
      rawResponse: data
    };

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error('[Passport API Proxy Error]:', error);
    return NextResponse.json(
      { error: 'Failed to communicate with Passport India server.', details: error?.message || String(error) },
      { status: 502 }
    );
  }
}
