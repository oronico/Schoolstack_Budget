import { Readable } from "stream";
import { randomUUID } from "crypto";
import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  GetObjectTaggingCommand,
  PutObjectTaggingCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

// Cloudflare R2 (S3-compatible). The AWS SDK is just the S3 protocol
// client — no AWS account, no AWS endpoints. Every request goes to the
// configured R2 endpoint. Replit App Storage / GCS sidecar removed
// 2026-05-18 (Task #1004); no historical data carry-over (Task #1006
// scoped out — DB-side scan confirmed zero referenced object paths
// across all candidate tables).

let _client: S3Client | null = null;
let _bucket: string | null = null;

function r2Config(): { client: S3Client; bucket: string } {
  if (_client && _bucket) return { client: _client, bucket: _bucket };
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
    const missing = [
      !accessKeyId && "R2_ACCESS_KEY_ID",
      !secretAccessKey && "R2_SECRET_ACCESS_KEY",
      !endpoint && "R2_ENDPOINT",
      !bucket && "R2_BUCKET_NAME",
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `R2 object storage is not configured (missing: ${missing}). ` +
        `Set the four R2_* env vars in the deployment environment.`,
    );
  }
  _client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
  _bucket = bucket;
  return { client: _client, bucket };
}

function stripSlashes(s: string): string {
  return s.replace(/^\/+|\/+$/g, "");
}

function joinKey(prefix: string, file: string): string {
  return `${stripSlashes(prefix)}/${file.replace(/^\/+/, "")}`;
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

function is404(err: unknown): boolean {
  const e = err as { $metadata?: { httpStatusCode?: number }; name?: string } | null;
  if (!e) return false;
  if (e.$metadata?.httpStatusCode === 404) return true;
  return e.name === "NotFound" || e.name === "NoSuchKey";
}

/**
 * Thin wrapper around an R2 object reference. The method shape mirrors
 * the subset of @google-cloud/storage's `File` API that the rest of the
 * api-server depends on (`.exists()`, `.getMetadata()`, `.download()`,
 * `.createReadStream()`, `.delete()`, `.name`) so callers in
 * `routes/storage.ts`, `routes/models.ts`, `scripts/cleanup-orphan-uploads.ts`,
 * and `lib/packets/lender-packet-pdf.ts` keep working unchanged after
 * the GCS → R2 swap. The two new methods (`getTagging`, `setTagging`)
 * back the ACL policy storage that lived in GCS custom metadata under
 * the old implementation; we use S3 object tags instead because object
 * metadata is immutable post-PUT without a CopyObject, while tags are
 * mutable in place.
 */
export class ObjectFile {
  constructor(public readonly bucket: string, public readonly key: string) {}

  get name(): string {
    return this.key;
  }

  async exists(): Promise<[boolean]> {
    const { client } = r2Config();
    try {
      await client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.key }));
      return [true];
    } catch (err) {
      if (is404(err)) return [false];
      throw err;
    }
  }

  async getMetadata(): Promise<
    [{ contentType?: string; size?: number; metadata?: Record<string, string> }]
  > {
    const { client } = r2Config();
    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.key }),
      );
      return [
        {
          contentType: head.ContentType,
          size: head.ContentLength,
          metadata: head.Metadata,
        },
      ];
    } catch (err) {
      if (is404(err)) throw new ObjectNotFoundError();
      throw err;
    }
  }

  async download(): Promise<[Buffer]> {
    const { client } = r2Config();
    try {
      const res = await client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.key }),
      );
      if (!res.Body) throw new ObjectNotFoundError();
      const chunks: Buffer[] = [];
      for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return [Buffer.concat(chunks)];
    } catch (err) {
      if (is404(err)) throw new ObjectNotFoundError();
      throw err;
    }
  }

  createReadStream(): Readable {
    const bucket = this.bucket;
    const key = this.key;
    async function* gen(): AsyncGenerator<Buffer> {
      const { client } = r2Config();
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!res.Body) return;
      for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
        yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      }
    }
    return Readable.from(gen());
  }

  async delete(opts?: { ignoreNotFound?: boolean }): Promise<void> {
    const { client } = r2Config();
    try {
      await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key }));
    } catch (err) {
      if (opts?.ignoreNotFound && is404(err)) return;
      throw err;
    }
  }

  async getTagging(): Promise<Record<string, string>> {
    const { client } = r2Config();
    try {
      const res = await client.send(
        new GetObjectTaggingCommand({ Bucket: this.bucket, Key: this.key }),
      );
      const out: Record<string, string> = {};
      for (const t of res.TagSet ?? []) {
        if (t.Key && typeof t.Value === "string") out[t.Key] = t.Value;
      }
      return out;
    } catch (err) {
      if (is404(err)) throw new ObjectNotFoundError();
      throw err;
    }
  }

  async setTagging(tags: Record<string, string>): Promise<void> {
    const { client } = r2Config();
    await client.send(
      new PutObjectTaggingCommand({
        Bucket: this.bucket,
        Key: this.key,
        Tagging: {
          TagSet: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
        },
      }),
    );
  }
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((p) => p.trim())
          .filter((p) => p.length > 0),
      ),
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Set it to a comma-separated " +
          "list of key prefixes inside the R2 bucket (e.g. `public`).",
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Set it to the key prefix inside the " +
          "R2 bucket where uploads should land (e.g. `private`).",
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<ObjectFile | null> {
    const { bucket } = r2Config();
    for (const prefix of this.getPublicObjectSearchPaths()) {
      const key = joinKey(prefix, filePath);
      const file = new ObjectFile(bucket, key);
      const [exists] = await file.exists();
      if (exists) return file;
    }
    return null;
  }

  async downloadObject(file: ObjectFile, cacheTtlSec: number = 3600): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";

    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": metadata.contentType || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(ownerUserId?: string | number): Promise<string> {
    const { client, bucket } = r2Config();
    const privateDir = stripSlashes(this.getPrivateObjectDir());

    const objectId = randomUUID();
    // Task #734 — encode the planned owner into the object name so the
    // finalize step (and a defensive check at download time) can verify
    // the bytes belong to the founder who requested the URL. Anonymous
    // uploads land under uploads/anon/<id> and are not finalizable.
    const ownerSegment =
      ownerUserId !== undefined && ownerUserId !== null && String(ownerUserId).length > 0
        ? `u-${String(ownerUserId)}`
        : "anon";
    const key = `${privateDir}/uploads/${ownerSegment}/${objectId}`;

    const cmd = new PutObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(client, cmd, { expiresIn: 900 });
  }

  async getObjectEntityFile(objectPath: string): Promise<ObjectFile> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const entityId = objectPath.slice("/objects/".length);
    if (!entityId) {
      throw new ObjectNotFoundError();
    }
    const { bucket } = r2Config();
    const privateDir = stripSlashes(this.getPrivateObjectDir());
    const key = `${privateDir}/${entityId}`;
    const file = new ObjectFile(bucket, key);
    const [exists] = await file.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return file;
  }

  /**
   * Accepts either an already-normalized `/objects/<entityId>` path or
   * a presigned R2 URL produced by `getObjectEntityUploadURL`. In both
   * cases returns the canonical `/objects/<entityId>` shape that gets
   * persisted on the model. Anything else (including legacy GCS URLs —
   * none exist per Task #1006 verification) passes through unchanged.
   */
  normalizeObjectEntityPath(rawPath: string): string {
    if (rawPath.startsWith("/objects/")) return rawPath;

    let urlKey: string | null = null;
    try {
      const url = new URL(rawPath);
      // R2 with forcePathStyle: true uses /<bucket>/<key> in the path.
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        urlKey = parts.slice(1).join("/");
      }
    } catch {
      // Not a URL — fall through and treat rawPath as a key/path.
    }

    const key = urlKey ?? rawPath.replace(/^\/+/, "");
    const privateDir = stripSlashes(this.getPrivateObjectDir());
    const prefix = `${privateDir}/`;
    if (key.startsWith(prefix)) {
      return `/objects/${key.slice(prefix.length)}`;
    }
    return rawPath;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  /**
   * Task #736 — delete an evidence object referenced by a model.
   * Accepts either the canonical `/objects/<id>` path stored on the
   * model or a raw presigned upload URL. Returns true if the underlying
   * object was deleted (or never existed); false on any other failure
   * so callers can decide to log and continue rather than fail the
   * surrounding operation.
   */
  async deleteObjectEntity(rawPath: string): Promise<boolean> {
    try {
      const normalized = this.normalizeObjectEntityPath(rawPath);
      if (!normalized.startsWith("/objects/")) return false;
      const entityId = normalized.slice("/objects/".length);
      if (!entityId) return false;
      const { bucket } = r2Config();
      const privateDir = stripSlashes(this.getPrivateObjectDir());
      const key = `${privateDir}/${entityId}`;
      const file = new ObjectFile(bucket, key);
      await file.delete({ ignoreNotFound: true });
      return true;
    } catch (err) {
      console.warn("[objectStorage] deleteObjectEntity failed", { rawPath, err });
      return false;
    }
  }

  /**
   * Task #736 — list every `uploads/<id>` object under PRIVATE_OBJECT_DIR.
   * Returns `/objects/<id>` paths so callers can compare directly with
   * what's persisted on the model.
   */
  async listUploadObjectPaths(): Promise<string[]> {
    const { client, bucket } = r2Config();
    const privateDir = stripSlashes(this.getPrivateObjectDir());
    const prefix = `${privateDir}/uploads/`;
    const out: string[] = [];
    let continuationToken: string | undefined;
    do {
      const res = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const c of res.Contents ?? []) {
        if (c.Key && c.Key.startsWith(`${privateDir}/`)) {
          const entityId = c.Key.slice(privateDir.length + 1);
          out.push(`/objects/${entityId}`);
        }
      }
      continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (continuationToken);
    return out;
  }

  // Task #734 — derive the planned owner userId from a normalized
  // object path produced by `getObjectEntityUploadURL(ownerUserId)`.
  //
  // Canonical shape is *exactly* `/objects/uploads/u-<userId>/<objectId>`:
  // three segments after `/objects/`, the first must be the literal
  // string `uploads`, the second must start with `u-`, the third must
  // be a non-empty single segment. Anything else (extra segments, a
  // different prefix, an empty userId, slashes inside the objectId)
  // returns undefined.
  //
  // This is used as a defense-in-depth authorization fallback in
  // `/storage/objects/*` and `/storage/evidence-thumbnail/objects/*`
  // when no ACL policy has been written yet (e.g. uploaded but never
  // finalized). A loose match here would let a caller dress up a
  // request path with an attacker-chosen `u-<self-id>` segment in
  // front of the real owner's segment and get past the fallback.
  // Even though the actual R2 key is derived from the same request
  // path (so a forged path resolves to a non-existent object and
  // would 404 today), anchoring the parser keeps the contract honest
  // for any future caller that adds a non-canonical key shape.
  parseOwnerUserIdFromObjectPath(objectPath: string): string | undefined {
    if (!objectPath.startsWith("/objects/")) return undefined;
    const entityId = objectPath.slice("/objects/".length);
    const parts = entityId.split("/");
    if (parts.length !== 3) return undefined;
    if (parts[0] !== "uploads") return undefined;
    const ownerSeg = parts[1];
    if (!ownerSeg.startsWith("u-")) return undefined;
    const id = ownerSeg.slice(2);
    if (id.length === 0) return undefined;
    // userIds in this codebase are numeric (serial PKs) but we accept
    // the standard URL-safe alphanumeric+_- set to avoid coupling
    // this parser to any one ID scheme.
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return undefined;
    if (parts[2].length === 0) return undefined;
    return id;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: ObjectFile;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}
