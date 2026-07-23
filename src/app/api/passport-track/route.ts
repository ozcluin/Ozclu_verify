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

    // ── API1: Passport Seva (primary) ──
    const api1Headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin': 'https://www.passportindia.gov.in',
      'Referer': 'https://www.passportindia.gov.in/',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    };

    const api1Url = 'https://api1.passportindia.gov.in/v1/online/trackStatusForFileNo';
    const api1Payload = {
      requestResponseMap: {
        fileNo: fileNumber.trim(),
        applDob: formattedDob,
        optStatus: optStatusValue
      }
    };

    let passportData: any = null;
    let api1Error: string | null = null;
    let source: string = 'api1';

    try {
      const apiRes = await fetch(api1Url, {
        method: 'POST',
        headers: api1Headers,
        body: JSON.stringify(api1Payload)
      });

      if (!apiRes.ok) {
        const errorText = await apiRes.text();
        api1Error = `Passport India service returned HTTP status ${apiRes.status}.`;
      } else {
        const data = await apiRes.json();
        if (data.strReturnString === 'error' || (data.fieldErrors && Object.keys(data.fieldErrors).length > 0)) {
          const fieldMsg = data.fieldErrors ? Object.values(data.fieldErrors).flat().join(', ') : '';
          api1Error = fieldMsg || 'Invalid File Number or Date of Birth. Please verify your details.';
        } else {
          passportData = data;
        }
      }
    } catch (err: any) {
      api1Error = err?.message || 'Failed to connect to Passport India server.';
    }

    // ── API2: Mission Portal (fallback) — only if API1 failed ──
    if (api1Error || !passportData) {
      let api2Error: string | null = null;

      const api2Headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://mportal.passportindia.gov.in',
        'Referer': 'https://mportal.passportindia.gov.in/',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'
      };

      const api2Url = 'https://api2.passportindia.gov.in/v1/mproddc/online/gpsp/trackApplicationStatus';
      const api2Payload = {
        requestResponseMap: {
          refNo: fileNumber.trim(),
          applDob: formattedDob,
          optStatus: optStatusValue
        }
      };

      try {
        const api2Res = await fetch(api2Url, {
          method: 'POST',
          headers: api2Headers,
          body: JSON.stringify(api2Payload)
        });

        if (!api2Res.ok) {
          const errText = await api2Res.text();
          api2Error = `Mission Portal returned HTTP status ${api2Res.status}.`;
        } else {
          const data2 = await api2Res.json();
          if (data2.strReturnString === 'error') {
            const errMsg2 = data2.actionErrors?.join(', ') || 'Invalid ARN / File Number or Date of Birth.';
            api2Error = errMsg2;
          } else {
            passportData = data2;
            source = 'api2_mportal';
          }
        }
      } catch (err2: any) {
        api2Error = err2?.message || 'Failed to connect to Mission Portal server.';
      }

      // If both APIs failed, return error
      if (api2Error || !passportData) {
        return NextResponse.json(
          { error: api2Error || api1Error || 'Passport verification failed on both portals.' },
          { status: 404 }
        );
      }
    }

    const map = passportData.requestResponseMap || {};
    const appStatusObj =
      Array.isArray(map.applicationStatus) && map.applicationStatus.length > 0
        ? map.applicationStatus[0]
        : {};

    const responsePayload = {
      success: true,
      source,
      fileNumber: appStatusObj.FILE_NO || map.fileNo || map.refNo || fileNumber,
      dateOfBirth: appStatusObj.DATE_OF_BIRTH || map.applDob || formattedDob,
      givenName: appStatusObj.APPL_GIVEN_NAME || '—',
      surname: appStatusObj.APPL_SURNAME || '—',
      applicantName: appStatusObj.APPL_GIVEN_NAME && appStatusObj.APPL_SURNAME
        ? `${appStatusObj.APPL_GIVEN_NAME} ${appStatusObj.APPL_SURNAME}`
        : appStatusObj.APPL_GIVEN_NAME || appStatusObj.APPL_SURNAME || '—',
      typeOfApplication: appStatusObj.PARAM_VALUE || 'Normal',
      applicationReceivedDate: appStatusObj.APP_SUB_DATE || '—',
      applicationRefNo: appStatusObj.APP_REF_NO_FK || '—',
      status: map.statusMessage || appStatusObj.STATUS_MESSAGE || 'Status Retrieved Successfully',
      optStatus: optStatusValue,
      rawResponse: passportData
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
