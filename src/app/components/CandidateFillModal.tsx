"use client";

import React, { useState, useEffect } from "react";
import { X, Briefcase, GraduationCap, Send, CheckCircle, AlertCircle, Building2, MapPin, Calendar, UserCheck, Award } from "lucide-react";
import { usePortal } from "src/context/PortalContext";
import { INDIAN_STATES } from "src/lib/courts-mapping";
import { Country, State, City } from "country-state-city";

interface CandidateFillModalProps {
  isOpen: boolean;
  onClose: () => void;
  verificationId: string;
  verificationType: "employment" | "education";
  candidateName?: string;
  initialData?: any;
  onSuccess?: () => void;
}

export default function CandidateFillModal({
  isOpen,
  onClose,
  verificationId,
  verificationType,
  candidateName,
  initialData,
  onSuccess,
}: CandidateFillModalProps) {
  const { submitEmploymentData, submitEducationData } = usePortal();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Employment Form State
  const [empForm, setEmpForm] = useState({
    country: "India",
    state: "",
    city: "",
    companyName: "",
    addressLine1: "",
    addressLine2: "",
    companyTelephoneCode: "+91",
    companyTelephone: "",
    department: "",
    position: "",
    employmentPeriodFrom: "",
    employmentPeriodTo: "",
    employeeCode: "",
    reportingManagerName: "",
    reportingManagerDepartment: "",
    reportingManagerContactCode: "+91",
    reportingManagerContact: "",
    reportingManagerEmail: "",
    annualCTC: "",
    employmentType: "",
    agencyDetails: "",
    reasonForLeaving: "",
    remarks: "",
  });

  // Education Form State
  const [eduForm, setEduForm] = useState({
    degreeType: "",
    courseName: "",
    boardUniversity: "",
    institutionName: "",
    rollNumber: "",
    passingYear: "",
    certificateFile: "",
  });

  // Location helpers
  const [statesList, setStatesList] = useState<Array<{ name: string; code: string }>>([]);
  const [citiesList, setCitiesList] = useState<Array<{ name: string; value: string }>>([]);

  useEffect(() => {
    if (initialData) {
      if (verificationType === "employment") {
        setEmpForm((prev) => ({ ...prev, ...initialData }));
      } else if (verificationType === "education") {
        setEduForm((prev) => ({ ...prev, ...initialData }));
      }
    }
  }, [initialData, verificationType]);

  useEffect(() => {
    if (empForm.country === "India") {
      setStatesList([]);
    } else {
      const allCountries = Country.getAllCountries();
      const matched = allCountries.find(c => c.name.toLowerCase() === empForm.country.toLowerCase());
      if (matched) {
        const countryStates = State.getStatesOfCountry(matched.isoCode);
        setStatesList(countryStates.map(s => ({ name: s.name, code: s.isoCode })).sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        setStatesList([]);
      }
    }
  }, [empForm.country]);

  useEffect(() => {
    if (empForm.country !== "India" && empForm.state && statesList.length > 0) {
      const matchedState = statesList.find(s => s.name.toLowerCase() === empForm.state.toLowerCase());
      const matchedCountry = Country.getAllCountries().find(c => c.name.toLowerCase() === empForm.country.toLowerCase());
      if (matchedState && matchedCountry) {
        const stateCities = City.getCitiesOfState(matchedCountry.isoCode, matchedState.code);
        setCitiesList(stateCities.map(c => ({ name: c.name, value: c.name })).sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        setCitiesList([]);
      }
    } else {
      setCitiesList([]);
    }
  }, [empForm.state, empForm.country, statesList]);

  if (!isOpen) return null;

  const updateEmp = (field: string, val: string) => {
    setEmpForm((prev) => ({ ...prev, [field]: val }));
  };

  const updateEdu = (field: string, val: string) => {
    setEduForm((prev) => ({ ...prev, [field]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (verificationType === "employment") {
      if (!empForm.companyName.trim()) {
        setErrorMsg("Company Name is required");
        return;
      }
      if (!empForm.employmentPeriodFrom) {
        setErrorMsg("Employment Period From date is required");
        return;
      }
    } else if (verificationType === "education") {
      if (!eduForm.degreeType) {
        setErrorMsg("Degree Category is required");
        return;
      }
      if (!eduForm.courseName.trim()) {
        setErrorMsg("Course / Degree Name is required");
        return;
      }
      if (!eduForm.boardUniversity.trim()) {
        setErrorMsg("Board / University Name is required");
        return;
      }
      if (!eduForm.institutionName.trim()) {
        setErrorMsg("Institution Name is required");
        return;
      }
      if (!eduForm.rollNumber.trim()) {
        setErrorMsg("Roll / Registration Number is required");
        return;
      }
      if (!eduForm.passingYear.trim()) {
        setErrorMsg("Passing Year is required");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      let res;
      if (verificationType === "employment") {
        res = await submitEmploymentData(verificationId, empForm);
      } else {
        res = await submitEducationData(verificationId, eduForm);
      }

      if (res && res.success) {
        setSuccessMsg("Candidate verification details submitted successfully!");
        if (onSuccess) onSuccess();
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setErrorMsg(res?.error || "Failed to submit verification details");
      }
    } catch (err: any) {
      setErrorMsg("Failed to submit verification details");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[99999] animate-fade-in overflow-y-auto">
      <div className="bg-white border border-[#eaf0e4] rounded-3xl max-w-3xl w-full shadow-2xl relative my-8 overflow-hidden animate-scale-up flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-[#181d16] via-[#1E293B] to-[#181d16] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl border border-white/20">
              {verificationType === "employment" ? (
                <Briefcase className="w-5 h-5 text-emerald-400" />
              ) : (
                <GraduationCap className="w-5 h-5 text-indigo-400" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">
                {verificationType === "employment" ? "Fill Employment Details" : "Fill Education Details"}
              </h3>
              <p className="text-xs text-slate-300 font-medium">
                {candidateName ? `Candidate: ${candidateName}` : `Request ID: ${verificationId}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex flex-col gap-6 font-body-sm flex-1">
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-4 text-xs font-semibold flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {verificationType === "employment" ? (
            /* ═══════════════════════════════════════════════════ */
            /* EMPLOYMENT DETAILS FORM                             */
            /* ═══════════════════════════════════════════════════ */
            <div className="flex flex-col gap-6">
              {/* Company Location */}
              <div className="bg-[#f6fbf0]/60 border border-[#eaf0e4] rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 border-b border-[#eaf0e4] pb-2">
                  <MapPin className="w-4 h-4 text-[#00450e]" />
                  <span className="font-bold text-xs uppercase text-[#181d16] tracking-wider">Company Location</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Country</label>
                    <select
                      value={empForm.country}
                      onChange={(e) => {
                        updateEmp("country", e.target.value);
                        updateEmp("state", "");
                        updateEmp("city", "");
                      }}
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                    >
                      <option value="India">India</option>
                      {[...Country.getAllCountries()]
                        .filter((c) => c.name !== "India")
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((c) => (
                          <option key={c.isoCode} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">State</label>
                    {empForm.country === "India" ? (
                      <select
                        value={empForm.state}
                        onChange={(e) => updateEmp("state", e.target.value)}
                        className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                      >
                        <option value="">Select State</option>
                        {[...INDIAN_STATES].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                          <option key={s.code} value={s.name}>{s.name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={empForm.state}
                        onChange={(e) => updateEmp("state", e.target.value)}
                        placeholder="State name"
                        className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                      />
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">City / District</label>
                    <input
                      type="text"
                      value={empForm.city}
                      onChange={(e) => updateEmp("city", e.target.value)}
                      placeholder="City name"
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                    />
                  </div>
                </div>
              </div>

              {/* Company Details */}
              <div className="bg-[#f6fbf0]/60 border border-[#eaf0e4] rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 border-b border-[#eaf0e4] pb-2">
                  <Building2 className="w-4 h-4 text-[#00450e]" />
                  <span className="font-bold text-xs uppercase text-[#181d16] tracking-wider">Company Details</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Company Name *</label>
                    <input
                      type="text"
                      value={empForm.companyName}
                      onChange={(e) => updateEmp("companyName", e.target.value)}
                      placeholder="Company name"
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Department</label>
                    <input
                      type="text"
                      value={empForm.department}
                      onChange={(e) => updateEmp("department", e.target.value)}
                      placeholder="Department"
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Address Line 1</label>
                    <input
                      type="text"
                      value={empForm.addressLine1}
                      onChange={(e) => updateEmp("addressLine1", e.target.value)}
                      placeholder="Street address line 1"
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Company Telephone</label>
                    <div className="flex gap-2">
                      <select
                        value={empForm.companyTelephoneCode}
                        onChange={(e) => updateEmp("companyTelephoneCode", e.target.value)}
                        className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white w-20 focus:outline-none"
                      >
                        <option value="+91">+91</option>
                        <option value="+1">+1</option>
                        <option value="+44">+44</option>
                      </select>
                      <input
                        type="tel"
                        value={empForm.companyTelephone}
                        onChange={(e) => updateEmp("companyTelephone", e.target.value)}
                        placeholder="Phone number"
                        className="flex-1 border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Position / Title</label>
                    <input
                      type="text"
                      value={empForm.position}
                      onChange={(e) => updateEmp("position", e.target.value)}
                      placeholder="Job title / position"
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                    />
                  </div>
                </div>
              </div>

              {/* Employment Period */}
              <div className="bg-[#f6fbf0]/60 border border-[#eaf0e4] rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 border-b border-[#eaf0e4] pb-2">
                  <Calendar className="w-4 h-4 text-[#00450e]" />
                  <span className="font-bold text-xs uppercase text-[#181d16] tracking-wider">Employment Period &amp; Identifiers</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">From Date *</label>
                    <input
                      type="date"
                      value={empForm.employmentPeriodFrom}
                      onChange={(e) => updateEmp("employmentPeriodFrom", e.target.value)}
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">To Date (Leave blank if Present)</label>
                    <input
                      type="date"
                      value={empForm.employmentPeriodTo}
                      onChange={(e) => updateEmp("employmentPeriodTo", e.target.value)}
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Employee Code</label>
                    <input
                      type="text"
                      value={empForm.employeeCode}
                      onChange={(e) => updateEmp("employeeCode", e.target.value.toUpperCase())}
                      placeholder="EMP ID / Code"
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white uppercase focus:outline-none focus:border-[#181d16]"
                    />
                  </div>
                </div>
              </div>

              {/* Reporting Manager */}
              <div className="bg-[#f6fbf0]/60 border border-[#eaf0e4] rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 border-b border-[#eaf0e4] pb-2">
                  <UserCheck className="w-4 h-4 text-[#00450e]" />
                  <span className="font-bold text-xs uppercase text-[#181d16] tracking-wider">Reporting Manager &amp; Compensation</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Reporting Manager Name</label>
                    <input
                      type="text"
                      value={empForm.reportingManagerName}
                      onChange={(e) => updateEmp("reportingManagerName", e.target.value)}
                      placeholder="Manager full name"
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Manager Email</label>
                    <input
                      type="email"
                      value={empForm.reportingManagerEmail}
                      onChange={(e) => updateEmp("reportingManagerEmail", e.target.value)}
                      placeholder="manager@company.com"
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Manager Contact No</label>
                    <div className="flex gap-2">
                      <select
                        value={empForm.reportingManagerContactCode}
                        onChange={(e) => updateEmp("reportingManagerContactCode", e.target.value)}
                        className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white w-20 focus:outline-none"
                      >
                        <option value="+91">+91</option>
                        <option value="+1">+1</option>
                        <option value="+44">+44</option>
                      </select>
                      <input
                        type="tel"
                        value={empForm.reportingManagerContact}
                        onChange={(e) => updateEmp("reportingManagerContact", e.target.value)}
                        placeholder="Mobile number"
                        className="flex-1 border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Annual CTC</label>
                    <input
                      type="text"
                      value={empForm.annualCTC}
                      onChange={(e) => updateEmp("annualCTC", e.target.value)}
                      placeholder="e.g. ₹12,00,000"
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                    />
                  </div>
                </div>
              </div>

              {/* Employment Type & Extras */}
              <div className="bg-[#f6fbf0]/60 border border-[#eaf0e4] rounded-2xl p-5 flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Employment Type</label>
                    <select
                      value={empForm.employmentType}
                      onChange={(e) => updateEmp("employmentType", e.target.value)}
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none"
                    >
                      <option value="">Select Type</option>
                      <option value="Permanent">Permanent</option>
                      <option value="Temporary">Temporary</option>
                      <option value="Contractual">Contractual</option>
                      <option value="Internship">Internship</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Agency Details (If contractual)</label>
                    <input
                      type="text"
                      value={empForm.agencyDetails}
                      onChange={(e) => updateEmp("agencyDetails", e.target.value)}
                      placeholder="Staffing agency name"
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Reason for Leaving &amp; Remarks</label>
                    <textarea
                      value={empForm.reasonForLeaving}
                      onChange={(e) => updateEmp("reasonForLeaving", e.target.value)}
                      rows={2}
                      placeholder="Reason for leaving or additional remarks"
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16] resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ═══════════════════════════════════════════════════ */
            /* EDUCATION DETAILS FORM                              */
            /* ═══════════════════════════════════════════════════ */
            <div className="flex flex-col gap-6">
              <div className="bg-[#f6fbf0]/60 border border-[#eaf0e4] rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 border-b border-[#eaf0e4] pb-2">
                  <Award className="w-4 h-4 text-purple-700" />
                  <span className="font-bold text-xs uppercase text-[#181d16] tracking-wider">Academic Credentials</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Degree Category *</label>
                    <select
                      value={eduForm.degreeType}
                      onChange={(e) => updateEdu("degreeType", e.target.value)}
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none"
                    >
                      <option value="">Select Degree Category</option>
                      <option value="10th / Matriculation">10th / Matriculation</option>
                      <option value="12th / Intermediate">12th / Intermediate</option>
                      <option value="Bachelor's Degree">Bachelor's Degree</option>
                      <option value="Master's Degree">Master's Degree</option>
                      <option value="Doctorate (PhD)">Doctorate (PhD)</option>
                      <option value="Diploma">Diploma / Certification</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Course / Degree Name *</label>
                    <input
                      type="text"
                      value={eduForm.courseName}
                      onChange={(e) => updateEdu("courseName", e.target.value)}
                      placeholder="e.g. B.Tech Computer Science"
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Board / University Name *</label>
                    <input
                      type="text"
                      value={eduForm.boardUniversity}
                      onChange={(e) => updateEdu("boardUniversity", e.target.value)}
                      placeholder="e.g. Delhi University, CBSE"
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Institution / School / College Name *</label>
                    <input
                      type="text"
                      value={eduForm.institutionName}
                      onChange={(e) => updateEdu("institutionName", e.target.value)}
                      placeholder="e.g. Hansraj College"
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Roll / Registration / Enrollment Number *</label>
                    <input
                      type="text"
                      value={eduForm.rollNumber}
                      onChange={(e) => updateEdu("rollNumber", e.target.value)}
                      placeholder="Roll or Registration number"
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Passing Year *</label>
                    <input
                      type="number"
                      min="1950"
                      max="2026"
                      value={eduForm.passingYear}
                      onChange={(e) => updateEdu("passingYear", e.target.value)}
                      placeholder="e.g. 2023"
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Buttons Footer */}
          <div className="pt-4 border-t border-[#eaf0e4] flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 border border-[#eaf0e4] rounded-xl font-semibold text-xs text-[#334155] hover:bg-[#f6fbf0] transition-colors cursor-pointer bg-white"
            >
              Fill Later / Close
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-[#181d16] text-white hover:bg-[#1E293B] active:scale-95 rounded-xl font-semibold text-xs transition-all flex items-center gap-2 cursor-pointer shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <span>Submit Details</span>
                  <Send className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
