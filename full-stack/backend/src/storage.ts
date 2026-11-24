import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
export const storageRoot = () =>
  resolve(
    process.env.STORAGE_DIR ||
      fileURLToPath(new URL("../../storage/documents/", import.meta.url)),
  );
function path(key: string) {
  if (!/^[a-f0-9-]{36}\.(pdf|png|jpg)$/.test(key))
    throw new Error("Invalid object key");
  const p = resolve(storageRoot(), key);
  if (dirname(p) !== storageRoot()) throw new Error("Invalid object path");
  return p;
}
function s3() {
  return new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT,
  });
}
export async function putObject(key: string, data: Buffer, mime: string) {
  path(key);
  if (process.env.S3_BUCKET) {
    await s3().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: data,
        ContentType: mime,
        ServerSideEncryption:
          process.env.S3_ENCRYPTION === "AES256" ? "AES256" : undefined,
      }),
    );
  } else {
    await mkdir(storageRoot(), { recursive: true, mode: 0o700 });
    await writeFile(path(key), data, { flag: "wx", mode: 0o600 });
  }
}
export async function getObject(key: string) {
  path(key);
  if (process.env.S3_BUCKET) {
    const result = await s3().send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
    );
    return Buffer.from(await result.Body!.transformToByteArray());
  }
  return readFile(path(key));
}
export async function removeObject(key: string) {
  path(key);
  if (process.env.S3_BUCKET)
    await s3().send(
      new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
    );
  else await unlink(path(key));
}
