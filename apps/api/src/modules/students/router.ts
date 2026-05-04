import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authGuard, authorize, AuthenticatedRequest } from "../../middlewares/auth";

const createStudentSchema = z.object({
  parentId: z.string().min(1),
  classId: z.string().min(1),
  externalStudentId: z.string().min(1).optional(),
  fullName: z.string().min(3),
  annualFee: z.number().positive()
});

export const studentRouter = Router();
studentRouter.use(authGuard);

studentRouter.post("/", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const payload = createStudentSchema.parse(req.body);
  const student = await prisma.student.create({
    data: {
      ...payload,
      schoolId: req.user!.schoolId
    }
  });

  res.status(201).json(student);
});

studentRouter.get("/", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const students = await prisma.student.findMany({
    where: { schoolId: req.user!.schoolId },
    include: {
      class: true,
      parent: true,
      payments: true
    }
  });

  res.json(students);
});
