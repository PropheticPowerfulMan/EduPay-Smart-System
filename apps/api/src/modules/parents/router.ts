import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authGuard, authorize, AuthenticatedRequest } from "../../middlewares/auth";

const studentInputSchema = z.object({
  fullName: z.string().min(1),
  classId: z.string().min(1),
  annualFee: z.union([z.string(), z.number()]).transform((v) => parseFloat(String(v)))
});

const parentSchema = z.object({
  fullName: z.string().min(1),
  nom: z.string().optional().default(""),
  postnom: z.string().optional().default(""),
  prenom: z.string().optional().default(""),
  phone: z.string().min(6),
  email: z.string().email(),
  preferredLanguage: z.enum(["fr", "en"]).default("fr"),
  students: z.array(studentInputSchema).optional().default([])
});

// In-memory fallback store (used when DB is unavailable)
let demoParents: any[] = [
  {
    id: "demo-parent-1",
    nom: "Kabila",
    postnom: "wa Muzuri",
    prenom: "Jean",
    fullName: "Kabila wa Muzuri Jean",
    phone: "+243810000001",
    email: "jean.kabila@example.com",
    students: [
      { id: "demo-student-1", fullName: "Kabila Marie", classId: "demo-class-1", className: "6ème A", annualFee: 45000 }
    ],
    createdAt: new Date().toISOString()
  }
];

function enrichParent(p: any) {
  const parts = (p.fullName || "").split(" ");
  return {
    ...p,
    nom: p.nom || parts[0] || "",
    postnom: p.postnom || parts[1] || "",
    prenom: p.prenom || parts[2] || "",
    students: (p.students || []).map((s: any) => ({
      ...s,
      className: s.class?.name ?? s.className ?? ""
    }))
  };
}

export const parentRouter = Router();
parentRouter.use(authGuard);

// GET all parents
parentRouter.get("/", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  try {
    const parents = await prisma.parent.findMany({
      where: { schoolId: req.user!.schoolId },
      include: { students: { include: { class: true } } }
    });
    return res.json(parents.map(enrichParent));
  } catch (error) {
    console.error("DB unavailable on parent list, using demo data", error);
    return res.json(demoParents);
  }
});

// GET /me (for PARENT role)
parentRouter.get("/me", authorize("PARENT"), async (req: AuthenticatedRequest, res) => {
  try {
    const parent = await prisma.parent.findFirst({
      where: { schoolId: req.user!.schoolId, userId: req.user!.sub },
      include: { students: { include: { class: true, payments: true } } }
    });
    return res.json(parent ? enrichParent(parent) : null);
  } catch (error) {
    console.error("DB unavailable on parent/me", error);
    return res.json(null);
  }
});

// POST create parent + students
parentRouter.post("/", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const payload = parentSchema.parse(req.body);
  try {
    const parent = await prisma.$transaction(async (tx) => {
      const p = await tx.parent.create({
        data: {
          fullName: payload.fullName,
          phone: payload.phone,
          email: payload.email,
          preferredLanguage: payload.preferredLanguage,
          schoolId: req.user!.schoolId
        }
      });
      for (const st of payload.students) {
        await tx.student.create({
          data: {
            fullName: st.fullName,
            classId: st.classId,
            annualFee: st.annualFee,
            parentId: p.id,
            schoolId: req.user!.schoolId
          }
        });
      }
      return tx.parent.findUnique({
        where: { id: p.id },
        include: { students: { include: { class: true } } }
      });
    });
    return res.status(201).json(enrichParent({ ...parent, nom: payload.nom, postnom: payload.postnom, prenom: payload.prenom }));
  } catch (error) {
    console.error("DB unavailable on parent create, using demo store", error);
    const newParent = {
      id: `demo-parent-${Date.now()}`,
      nom: payload.nom,
      postnom: payload.postnom,
      prenom: payload.prenom,
      fullName: payload.fullName,
      phone: payload.phone,
      email: payload.email,
      students: payload.students.map((s, i) => ({
        id: `demo-student-${Date.now()}-${i}`,
        fullName: s.fullName,
        classId: s.classId,
        className: "Classe",
        annualFee: s.annualFee
      })),
      createdAt: new Date().toISOString()
    };
    demoParents.push(newParent);
    return res.status(201).json(newParent);
  }
});

// PUT update parent
parentRouter.put("/:id", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const payload = parentSchema.parse(req.body);
  try {
    const parent = await prisma.parent.update({
      where: { id },
      data: {
        fullName: payload.fullName,
        phone: payload.phone,
        email: payload.email,
        preferredLanguage: payload.preferredLanguage
      },
      include: { students: { include: { class: true } } }
    });
    return res.json(enrichParent({ ...parent, nom: payload.nom, postnom: payload.postnom, prenom: payload.prenom }));
  } catch (error) {
    console.error("DB unavailable on parent update, using demo store", error);
    const idx = demoParents.findIndex((p) => p.id === id);
    if (idx !== -1) {
      demoParents[idx] = { ...demoParents[idx], ...payload };
      return res.json(demoParents[idx]);
    }
    return res.status(404).json({ message: "Parent non trouvé" });
  }
});

// DELETE parent
parentRouter.delete("/:id", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    await prisma.parent.delete({ where: { id } });
    return res.status(204).end();
  } catch (error) {
    console.error("DB unavailable on parent delete, using demo store", error);
    demoParents = demoParents.filter((p) => p.id !== id);
    return res.status(204).end();
  }
});
