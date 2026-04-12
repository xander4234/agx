import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export function hashPassword(password) {
  return bcrypt.hash(password, 10);
}
export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signToken({ userId, clinicId, role, name }) {
  return jwt.sign({ userId, clinicId, role, name }, process.env.JWT_SECRET, { expiresIn: "7d" });
}
