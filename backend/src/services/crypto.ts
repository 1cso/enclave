import crypto from "node:crypto";
import { CitadelError } from "./errors.js";

export type KdfParams = {
  saltB64: string;
  N: number;
  r: number;
  p: number;
  dkLen: number;
};

export function randomB64(bytes: number) {
  return crypto.randomBytes(bytes).toString("base64");
}

export async function deriveKey(password: string, params: KdfParams): Promise<Buffer> {
  const salt = Buffer.from(params.saltB64, "base64");
  return await new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      params.dkLen,
      { N: params.N, r: params.r, p: params.p, maxmem: 1024 * 1024 * 1024 },
      (err, derivedKey) => {
        if (err) return reject(err);
        resolve(derivedKey as Buffer);
      }
    );
  });
}

export type AeadEnvelope = {
  alg: "AES-256-GCM";
  ivB64: string;
  tagB64: string;
  ciphertextB64: string;
};

export function encryptAead(plaintext: Buffer, key: Buffer, aad?: Buffer): AeadEnvelope {
  if (key.length !== 32) throw new CitadelError("BAD_KEY", "Key length must be 32 bytes", 500);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  if (aad) cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    alg: "AES-256-GCM",
    ivB64: iv.toString("base64"),
    tagB64: tag.toString("base64"),
    ciphertextB64: ciphertext.toString("base64")
  };
}

export function decryptAead(env: AeadEnvelope, key: Buffer, aad?: Buffer): Buffer {
  if (env.alg !== "AES-256-GCM") throw new CitadelError("UNSUPPORTED_ALG", "Unsupported cipher", 400);
  const iv = Buffer.from(env.ivB64, "base64");
  const tag = Buffer.from(env.tagB64, "base64");
  const ciphertext = Buffer.from(env.ciphertextB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new CitadelError("BAD_PASSWORD_OR_CORRUPTED", "Wrong password or corrupted container", 401);
  }
}

