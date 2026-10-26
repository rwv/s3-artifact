import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { S3Client, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import type { Readable } from "node:stream";

export interface StorageConfig {
  bucket: string;
  prefix: string;
  endpoint?: string;
  region: string;
  forcePathStyle: boolean;
}
export function createStorage(config: StorageConfig): S3Client {
  return new S3Client({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    forcePathStyle: config.forcePathStyle,
    maxAttempts: 3,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    requestHandler: new NodeHttpHandler({ connectionTimeout: 10_000, socketTimeout: 60_000 }),
  });
}
export async function putPayload(
  client: S3Client,
  bucket: string,
  key: string,
  file: string,
  size: number,
): Promise<void> {
  await new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: createReadStream(file),
      ContentLength: size,
      ContentType: "application/octet-stream",
    },
    partSize: 16 * 1024 * 1024,
    queueSize: 4,
    leavePartsOnError: false,
  }).done();
}
export async function getPayload(
  client: S3Client,
  bucket: string,
  key: string,
  file: string,
): Promise<void> {
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!result.Body) throw new Error("Object storage returned an empty response body.");
  await pipeline(result.Body as Readable, createWriteStream(file));
}
export async function deletePayload(client: S3Client, bucket: string, key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
