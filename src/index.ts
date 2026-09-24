import app from "./app";
import type { Request, Response } from "express";
import dotenv from "dotenv";
dotenv.config();

// health checker
app.get("/", (req: Request, res: Response) => {
    res.send("Hello World!");
});

const port = process.env.PORT;
app.listen(port, () => {
    console.log(`app listening on port ${port}`);
});
