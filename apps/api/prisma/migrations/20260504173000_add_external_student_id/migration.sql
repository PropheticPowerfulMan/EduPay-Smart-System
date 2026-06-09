-- AlterTable
ALTER TABLE "Student" ADD COLUMN "externalStudentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Student_schoolId_externalStudentId_key" ON "Student"("schoolId", "externalStudentId");