import Router from "express";
import { type Request, type Response } from "express";
import { registerUserSchema, signInSchema } from "../utils/schema";
import { prisma } from "../db/db";
import hashPassword from "../utils/hash";
import createToken from "../utils/token";

const router = Router();

// register user
router.post("/sign-up", async (req: Request, res: Response) => {
    const body = registerUserSchema.safeParse(req.body);

    if (!body.success) {
        return res.status(400).json({
            message: "Validation failed",
            errors: body.error.format(),
        });
    }
    const { name = "", email, password } = body?.data;
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (!existingUser) {
        res.status(400).json({ message: "user already exist" });
    }
    const hash = await hashPassword(password);
    const user = await prisma.user.create({ data: { name, email, hash } });

    if (!user) {
        res.status(400).json({
            message: "something went wrong, user hasn't signed Up",
        });
    }
    const token = createToken(user.id);
    res.cookie("authToken", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.status(201).json({ message: "user signed up successfully" });
});

router.post("/sign-in",async(req:Request , res:Response)=>{
     
})
export { router };
