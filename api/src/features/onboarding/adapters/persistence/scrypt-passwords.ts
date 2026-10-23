import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { PasswordHasher } from "../../application/ports.js";

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const PARAMETERS = { N: 16384, r: 8, p: 1 };
const PREFIX = "scrypt$16384$8$1";

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, PARAMETERS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export class ScryptPasswords implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const key = await derive(password, salt);
    return `${PREFIX}$${salt.toString("hex")}$${key.toString("hex")}`;
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    const parts = encodedHash.split("$");
    const salt = parts[4];
    const key = parts[5];
    if (
      parts.length !== 6 ||
      parts.slice(0, 4).join("$") !== PREFIX ||
      !salt ||
      !/^[a-f0-9]{32}$/.test(salt) ||
      !key ||
      !/^[a-f0-9]{128}$/.test(key)
    )
      return false;
    return timingSafeEqual(
      await derive(password, Buffer.from(salt, "hex")),
      Buffer.from(key, "hex"),
    );
  }
}
