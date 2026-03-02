import { randomBytes, timingSafeEqual } from "node:crypto";
import { argon2id } from "@noble/hashes/argon2.js";

const PASSWORD_MIN_LEN = 8;
const PASSWORD_MAX_LEN = 72;
const ARGON_MEMORY = 19_456;
const ARGON_ITERATIONS = 2;
const ARGON_PARALLELISM = 1;
const ARGON_HASH_LEN = 32;

export function validatePasswordStrength(password: string): string | null {
  if (password.length < PASSWORD_MIN_LEN || password.length > PASSWORD_MAX_LEN) {
    return `密码长度需在 ${PASSWORD_MIN_LEN}-${PASSWORD_MAX_LEN} 位之间`;
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "密码需包含字母和数字";
  }
  return null;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const digest = argon2id(password, salt, {
    m: ARGON_MEMORY,
    t: ARGON_ITERATIONS,
    p: ARGON_PARALLELISM,
    dkLen: ARGON_HASH_LEN,
  });

  const saltB64 = Buffer.from(salt).toString("base64url");
  const digestB64 = Buffer.from(digest).toString("base64url");
  return `argon2id$v=19$m=${ARGON_MEMORY},t=${ARGON_ITERATIONS},p=${ARGON_PARALLELISM}$${saltB64}$${digestB64}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 5 || parts[0] !== "argon2id" || parts[1] !== "v=19") {
    return false;
  }

  const paramStr = parts[2];
  const saltB64 = parts[3];
  const digestB64 = parts[4];

  const matches = /m=(\d+),t=(\d+),p=(\d+)/.exec(paramStr);
  if (!matches) {
    return false;
  }

  const m = Number(matches[1]);
  const t = Number(matches[2]);
  const p = Number(matches[3]);

  const salt = Buffer.from(saltB64, "base64url");
  const expected = Buffer.from(digestB64, "base64url");

  if (!salt.length || !expected.length) {
    return false;
  }

  const actual = Buffer.from(
    argon2id(password, salt, {
      m,
      t,
      p,
      dkLen: expected.length,
    }),
  );

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}
