import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const prisma = new PrismaClient();

type CliOptions = {
  cutoff: Date;
  writeFiles: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  let cutoff = new Date();
  let writeFiles = true;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--before") {
      const value = argv[index + 1];
      if (!value) throw new Error("L'option --before exige une date ISO, par ex. 2026-05-19T11:30:00Z");
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error(`Date invalide pour --before: ${value}`);
      }
      cutoff = parsed;
      index += 1;
      continue;
    }

    if (token === "--stdout-only") {
      writeFiles = false;
    }
  }

  return { cutoff, writeFiles };
}

function formatIsoStamp(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function formatHumanDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC"
  }).format(date);
}

function buildMarkdownReport(input: {
  cutoff: Date;
  generatedAt: Date;
  total: number;
  bySchool: Array<{ schoolName: string; count: number }>;
  rows: Array<{
    receiptNumber: string;
    receiptCreatedAt: string;
    transactionNumber: string;
    paymentCreatedAt: string;
    schoolName: string;
    parentName: string;
    amount: string;
    status: string;
  }>;
}) {
  const lines = [
    "# Rapport de régénération des reçus EduPay",
    "",
    `- Généré le : ${formatHumanDate(input.generatedAt)} UTC`,
    `- Coupure de regeneration: ${formatHumanDate(input.cutoff)} UTC`,
    `- Nombre total de reçus ? régénérer: ${input.total}`,
    ""
  ];

  if (input.bySchool.length > 0) {
    lines.push("## Répartition par école", "");
    for (const school of input.bySchool) {
      lines.push(`- ${school.schoolName}: ${school.count}`);
    }
    lines.push("");
  }

  lines.push("## Reçus concernés", "", "| Recu | Cree le | Transaction | Paiement | Ecole | Parent | Montant | Statut |", "| --- | --- | --- | --- | --- | --- | --- | --- |");

  for (const row of input.rows) {
    lines.push(`| ${row.receiptNumber} | ${row.receiptCreatedAt} | ${row.transactionNumber} | ${row.paymentCreatedAt} | ${row.schoolName} | ${row.parentName} | ${row.amount} | ${row.status} |`);
  }

  if (input.rows.length === 0) {
    lines.push("| Aucun | - | - | - | - | - | - | - |");
  }

  lines.push("", "## Note", "", "Tous les reçus exportés avant la coupure ci-dessus embarquent potentiellement l'ancien lien QR et doivent être régénérés après déploiement du correctif.");
  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const generatedAt = new Date();

  const receipts = await prisma.receipt.findMany({
    where: {
      createdAt: {
        lt: options.cutoff
      }
    },
    include: {
      school: {
        select: {
          name: true
        }
      },
      payment: {
        select: {
          transactionNumber: true,
          amount: true,
          status: true,
          createdAt: true,
          parent: {
            select: {
              fullName: true
            }
          }
        }
      }
    },
    orderBy: [
      { createdAt: "desc" },
      { receiptNumber: "desc" }
    ]
  });

  const rows = receipts.map((receipt) => ({
    receiptNumber: receipt.receiptNumber,
    receiptCreatedAt: receipt.createdAt.toISOString(),
    transactionNumber: receipt.payment.transactionNumber,
    paymentCreatedAt: receipt.payment.createdAt.toISOString(),
    schoolName: receipt.school.name,
    parentName: receipt.payment.parent?.fullName ?? "N/A",
    amount: Number(receipt.payment.amount).toFixed(5),
    status: receipt.payment.status
  }));

  const bySchoolMap = rows.reduce<Map<string, number>>((accumulator, row) => {
    accumulator.set(row.schoolName, (accumulator.get(row.schoolName) ?? 0) + 1);
    return accumulator;
  }, new Map());

  const bySchool = Array.from(bySchoolMap.entries())
    .map(([schoolName, count]) => ({ schoolName, count }))
    .sort((left, right) => right.count - left.count || left.schoolName.localeCompare(right.schoolName));

  const report = {
    generatedAt: generatedAt.toISOString(),
    cutoff: options.cutoff.toISOString(),
    total: rows.length,
    bySchool,
    receipts: rows
  };

  const markdown = buildMarkdownReport({
    cutoff: options.cutoff,
    generatedAt,
    total: rows.length,
    bySchool,
    rows
  });

  console.log(JSON.stringify(report, null, 2));

  if (options.writeFiles) {
    const workspaceVarDir = path.resolve(__dirname, "../../../../var");
    await fs.mkdir(workspaceVarDir, { recursive: true });

    const stamp = formatIsoStamp(generatedAt);
    const jsonPath = path.join(workspaceVarDir, `edupay-receipts-to-regenerate-${stamp}.json`);
    const mdPath = path.join(workspaceVarDir, `edupay-receipts-to-regenerate-${stamp}.md`);

    await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await fs.writeFile(mdPath, `${markdown}\n`, "utf8");

    console.error(`Rapports ecrits dans ${jsonPath}`);
    console.error(`Rapports ecrits dans ${mdPath}`);
  }
}

main()
  .catch((error) => {
    console.error("Échec du rapport de régénération des reçus", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });