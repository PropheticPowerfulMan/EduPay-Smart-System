CREATE TYPE "EmployeeDeductionMode" AS ENUM ('AUTOMATIC', 'MANUAL', 'HYBRID');

ALTER TABLE "EmployeeSalaryProfile"
  ADD COLUMN "deductionMode" "EmployeeDeductionMode" NOT NULL DEFAULT 'AUTOMATIC',
  ADD COLUMN "maxDeductionRate" DOUBLE PRECISION NOT NULL DEFAULT 35,
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "contactPhone" TEXT;

CREATE TABLE "EmployeeCommunicationLog" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "salaryProfileId" TEXT NOT NULL,
  "sentById" TEXT,
  "channel" "NotificationChannel" NOT NULL,
  "subject" TEXT,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmployeeCommunicationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmployeeCommunicationLog_schoolId_salaryProfileId_createdAt_idx" ON "EmployeeCommunicationLog"("schoolId", "salaryProfileId", "createdAt");
CREATE INDEX "EmployeeCommunicationLog_channel_status_idx" ON "EmployeeCommunicationLog"("channel", "status");

ALTER TABLE "EmployeeCommunicationLog" ADD CONSTRAINT "EmployeeCommunicationLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeCommunicationLog" ADD CONSTRAINT "EmployeeCommunicationLog_salaryProfileId_fkey" FOREIGN KEY ("salaryProfileId") REFERENCES "EmployeeSalaryProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeCommunicationLog" ADD CONSTRAINT "EmployeeCommunicationLog_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
