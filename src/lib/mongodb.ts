import { MongoClient, Db } from "mongodb";
import bcrypt from "bcryptjs";
import dns from "dns";
import { validateEnvironment } from "./envGuard";

// Use Google DNS to resolve MongoDB Atlas SRV records
// (the default local DNS may not support SRV lookups)
dns.setServers(["8.8.8.8", "8.8.4.4"]);


const uri = process.env.MONGODB_URI || "";
let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;
let seeded = false;
let envValidated = false;

if (!uri) {
  throw new Error("Please add your MongoDB URI to .env.local");
}

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  if (!client) {
    client = new MongoClient(uri);
    clientPromise = client.connect();
  }
  const connectedClient = await clientPromise!;
  const db = connectedClient.db("clusoverify");

  // Validate environment on first connection
  if (!envValidated) {
    validateEnvironment();
    envValidated = true;
  }

  // Run automatic seeding only in development with explicit opt-in
  if (!seeded) {
    if (process.env.NODE_ENV !== "production" && process.env.ALLOW_SEEDING === "true") {
      await seedDatabase(db);
    }
    seeded = true;
  }

  return { client: connectedClient, db };
}


async function seedDatabase(db: Db) {
  try {
    // 1. Seed settings
    const settingsCount = await db.collection("settings").countDocuments();
    if (settingsCount === 0) {
      await db.collection("settings").insertOne({
        id: "acme",
        companyName: "Acme Corporation",
        address: "123 Innovation Drive",
        city: "Techville",
        postalCode: "90210",
        contactFirstName: "Jane",
        contactLastName: "Doe",
        contactEmail: "jane.doe@acmecorp.com",
        billingOption: "invoice",
        cin: "U74999DL2021PTC384912",
        lut: "LUT-2026-987654",
        tin: "TIN-987654321"
      });
    }

    // 2. Seed verifications
    const verificationsCount = await db.collection("verifications").countDocuments();
    if (verificationsCount === 0) {
      await db.collection("verifications").insertMany([
        {
          id: "REQ-8902",
          name: "John Doe",
          email: "john.doe@gmail.com",
          orgName: "Acme Corporation",
          date: "Oct 24, 2023",
          status: "Completed",
          verifier: "Alice Jones",
          reportDetails: "All verification checks passed. SSN validated, criminal record check returned clean, and past 3 employers verified successfully.",
          notes: "Completed without issues."
        },
        {
          id: "REQ-8901",
          name: "Acme Corp KYB",
          email: "compliance@acmecorp.com",
          orgName: "Acme Corporation",
          date: "Oct 22, 2023",
          status: "Processing",
          verifier: "Bob Smith",
          reportDetails: null,
          notes: "Checking company records in municipal directory."
        },
        {
          id: "REQ-8895",
          name: "Jane Smith",
          email: "jane.smith@yahoo.com",
          orgName: "Acme Corporation",
          date: "Oct 18, 2023",
          status: "Completed",
          verifier: "Alice Jones",
          reportDetails: "Identity verified. ID scan match score: 98%. Address history confirmed with postal utility database.",
          notes: "Verified using digital identification check."
        },
        {
          id: "REQ-8880",
          name: "Global Tech Screening",
          email: "hr@globaltech.com",
          orgName: "Global Tech Inc",
          date: "Oct 10, 2023",
          status: "Needs Attention",
          verifier: null,
          reportDetails: null,
          notes: "Missing scan of Passport bio-page. Notification sent to subject."
        },
        {
          id: "REQ-8875",
          name: "Michael Chen",
          email: "mchen@gmail.com",
          orgName: "Acme Corporation",
          date: "Oct 05, 2023",
          status: "Completed",
          verifier: "Charlie Brown",
          reportDetails: "International background check finished. National ID card and educational records verified with Shanghai Jiao Tong University.",
          notes: "Completed checks on foreign documents."
        }
      ]);
    }

    // 3. Seed invoices
    const invoicesCount = await db.collection("invoices").countDocuments();
    if (invoicesCount === 0) {
      await db.collection("invoices").insertMany([
        {
          id: "INV-2023-11",
          orgName: "Acme Corporation",
          date: "Nov 01, 2023",
          dueDate: "Nov 15, 2023",
          amount: 1240.50,
          status: "Unpaid"
        },
        {
          id: "INV-2023-10",
          orgName: "Acme Corporation",
          date: "Oct 01, 2023",
          dueDate: "Oct 15, 2023",
          amount: 850.00,
          status: "Paid"
        },
        {
          id: "INV-2023-09",
          orgName: "Acme Corporation",
          date: "Sep 01, 2023",
          dueDate: "Sep 15, 2023",
          amount: 1120.25,
          status: "Paid"
        }
      ]);
    }

    // 4. Seed verifiers
    const verifiersCount = await db.collection("verifiers").countDocuments();
    if (verifiersCount === 0) {
      await db.collection("verifiers").insertMany([
        {
          id: "V-001",
          name: "Alice Jones",
          email: "alice@cluso.in",
          org: "Cluso",
          status: "Active"
        },
        {
          id: "V-002",
          name: "Bob Smith",
          email: "bob@cluso.in",
          org: "Cluso",
          status: "Active"
        },
        {
          id: "V-003",
          name: "Charlie Brown",
          email: "charlie@cluso.in",
          org: "Cluso",
          status: "Pending"
        }
      ]);
    }

    // 5. Seed users (default accounts)
    const usersCount = await db.collection("users").countDocuments();
    if (usersCount === 0) {
      const hashedAdminPassword = bcrypt.hashSync("Cluso@2026", 10);
      const hashedClientPassword = bcrypt.hashSync("client123", 10);
      await db.collection("users").insertMany([
        {
          email: "pkumar@cluso.in",
          password: hashedAdminPassword,
          fullName: "Pkumar",
          role: "admin",
          orgName: "Cluso",
          createdAt: new Date()
        },
        {
          email: "indiaops@cluso.in",
          password: hashedAdminPassword,
          fullName: "India Ops",
          role: "admin",
          orgName: "Cluso",
          createdAt: new Date()
        },
        {
          email: "client@test.com",
          password: hashedClientPassword,
          fullName: "Client User",
          role: "client",
          orgName: "Acme Corporation",
          createdAt: new Date()
        }
      ]);
    }
  } catch (error) {
    console.error("Seeding error in MongoDB:", error);
  }
}
