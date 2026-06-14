ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'EMPLOYEE';

CREATE TYPE "EmployeeObligationType" AS ENUM ('SALARY_ADVANCE', 'SCHOOL_DEBT', 'OTHER_DEBT');
CREATE TYPE "EmployeeRepaymentMethod" AS ENUM ('SALARY_DEDUCTION', 'EXTERNAL_PAYMENT', 'MIXED');
CREATE TYPE "EmployeeObligationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAID', 'OVERDUE', 'CANCELLED', 'WRITTEN_OFF');
CREATE TYPE "EmployeeRepaymentStatus" AS ENUM ('SCHEDULED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'SKIPPED');

CREATE TABLE "EmployeeObligation" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "salaryProfileId" TEXT NOT NULL,
  "createdById" TEXT,
  "approvedById" TEXT,
  "type" "EmployeeObligationType" NOT NULL,
  "title" TEXT NOT NULL,
  "principalAmount" DOUBLE PRECISION NOT NULL,
  "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "balance" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "repaymentMethod" "EmployeeRepaymentMethod" NOT NULL DEFAULT 'SALARY_DEDUCTION',
  "installmentAmount" DOUBLE PRECISION NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "status" "EmployeeObligationStatus" NOT NULL DEFAULT 'ACTIVE',
  "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
  "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "notes" TEXT,
  "metadata" JSONB,
  "approvedAt" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeObligation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeRepayment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "obligationId" TEXT NOT NULL,
  "salaryProfileId" TEXT NOT NULL,
  "payrollItemId" TEXT,
  "recordedById" TEXT,
  "method" "EmployeeRepaymentMethod" NOT NULL,
  "expectedAmount" DOUBLE PRECISION NOT NULL,
  "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "dueDate" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "status" "EmployeeRepaymentStatus" NOT NULL DEFAULT 'SCHEDULED',
  "reference" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeRepayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmployeeObligation_schoolId_status_dueDate_idx" ON "EmployeeObligation"("schoolId", "status", "dueDate");
CREATE INDEX "EmployeeObligation_salaryProfileId_status_idx" ON "EmployeeObligation"("salaryProfileId", "status");
CREATE INDEX "EmployeeRepayment_schoolId_dueDate_status_idx" ON "EmployeeRepayment"("schoolId", "dueDate", "status");
CREATE INDEX "EmployeeRepayment_salaryProfileId_status_idx" ON "EmployeeRepayment"("salaryProfileId", "status");

ALTER TABLE "EmployeeObligation" ADD CONSTRAINT "EmployeeObligation_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeObligation" ADD CONSTRAINT "EmployeeObligation_salaryProfileId_fkey" FOREIGN KEY ("salaryProfileId") REFERENCES "EmployeeSalaryProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeObligation" ADD CONSTRAINT "EmployeeObligation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeObligation" ADD CONSTRAINT "EmployeeObligation_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeRepayment" ADD CONSTRAINT "EmployeeRepayment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeRepayment" ADD CONSTRAINT "EmployeeRepayment_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "EmployeeObligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeRepayment" ADD CONSTRAINT "EmployeeRepayment_salaryProfileId_fkey" FOREIGN KEY ("salaryProfileId") REFERENCES "EmployeeSalaryProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeRepayment" ADD CONSTRAINT "EmployeeRepayment_payrollItemId_fkey" FOREIGN KEY ("payrollItemId") REFERENCES "PayrollItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeRepayment" ADD CONSTRAINT "EmployeeRepayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
