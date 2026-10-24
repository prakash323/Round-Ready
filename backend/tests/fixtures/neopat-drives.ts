/**
 * A sanitised NeoPAT response, in the shape captured from the live portal.
 *
 * Structure, key names and value formats are exactly as the portal returned
 * them on 24 October 2026 from `POST /api/v1/drives/student/drives`. The
 * employers are real and public (they appear on the batch's drive list); no
 * student identifier, token, cookie or personal field is reproduced here, and
 * none is needed to exercise the adapter.
 *
 * This fixture is the regression test for the portal changing shape. When a
 * sync starts reporting unreadable drives, the first question is whether this
 * file still matches what the portal sends — see README, "Diagnosing portal
 * layout changes".
 */

export const NEOPAT_SAMPLE = {
  success: true,
  data: {
    count: 151,
    data: [
      {
        drive_id: "dbc971fc-730f-4dd6-997a-f68750575db7",
        drive_number: "pat-PL-2026-1068",
        name: "Groww",
        company_name: "Groww",
        company_logo: "https://example.invalid/logo.png",
        company_category: "IT",
        company_location: ["Bangalore"],
        profile_designation: ["SDE Intern"],
        drive_type: ["Internship to Full time"],
        drive_status: "Upcoming",
        drive_objective: "SDE Intern",
        lastDate: "2026-07-04T03:30:58.000Z",
        degree: false,
        profileBased: false,
        resumeUpload: true,
        preference_count: 0,
        allow_priority: false,
        optionalFormData: [],
        reasons: [],
        removal_reason: null,
        rounds: [],
        salary_information: [
          {
            profile: "SDE Intern",
            role: "sde intern",
            salary: true,
            salaryBasis: "annually",
            salaryType: "fixed",
            fixedSalary: 2600000,
            fromRange: null,
            toRange: null,
            rangeSalary: null,
            stipend: true,
            stipendBasis: "monthly",
            stipendType: "fixed",
            fixedStipend: 100000,
          },
        ],
      },
      {
        // A range, as the portal renders "₹7L-21L PA".
        drive_id: "9f1d2c77-aaaa-4bbb-8ccc-1234567890ab",
        drive_number: "pat-PL-2026-1091",
        name: "Infosys",
        company_name: "Infosys",
        company_category: "IT",
        company_location: ["Pan India"],
        profile_designation: ["Digital Specialist Engineer (Trainee)"],
        drive_type: ["Full-Time"],
        drive_status: "Upcoming",
        drive_objective: "Infosys 2027 batch",
        lastDate: "2026-07-09T04:30:00.000Z",
        rounds: [],
        salary_information: [
          {
            profile: "Digital Specialist Engineer (Trainee)",
            salary: true,
            salaryBasis: "annually",
            salaryType: "range",
            fixedSalary: null,
            fromRange: 700000,
            toRange: 2100000,
            stipend: false,
            fixedStipend: null,
          },
        ],
      },
      {
        // Internship with a stipend only: no annual CTC exists to import.
        drive_id: "3a7b4e21-dddd-4eee-9fff-abcdef123456",
        drive_number: "pat-PL-2026-1104",
        name: "PixelCompute",
        company_name: "PixelCompute",
        company_category: "IT",
        company_location: ["Bhuvaneshwar"],
        profile_designation: ["intern"],
        drive_type: ["Internship"],
        drive_status: "Upcoming",
        drive_objective: "pixel compute super dream",
        lastDate: "2026-07-11T09:00:00.000Z",
        rounds: [],
        salary_information: [
          {
            profile: "intern",
            salary: false,
            fixedSalary: null,
            fromRange: null,
            toRange: null,
            stipend: true,
            stipendBasis: "monthly",
            stipendType: "fixed",
            fixedStipend: 40000,
          },
        ],
      },
    ],
  },
};

/** The list, as the snippet would hand it to the importer. */
export const NEOPAT_DRIVES = NEOPAT_SAMPLE.data.data;

export const NEOPAT_BASE_URL = "https://vit.neopat.ai/placements/drives";
