import jwt from "jsonwebtoken";

const createToken = (userId: string) => {
    return jwt.sign(userId, process.env.JWT_SECRET!);
};

export default createToken;
