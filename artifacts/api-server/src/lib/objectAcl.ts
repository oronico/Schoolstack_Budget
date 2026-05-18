import { ObjectFile, ObjectNotFoundError } from "./objectStorage";

// Stored as an S3 object tag under the key `aclPolicy`. The value is
// base64-encoded JSON because S3/R2 restrict tag values to a small
// character set that excludes JSON-meaningful characters like `{`, `}`,
// `"`, and `,`. Base64 characters (A-Z, a-z, 0-9, +, /, =) are all
// inside the allowed set. Typical policies (~40-80 chars of JSON →
// ~60-110 chars of base64) sit comfortably under the 256-char per-tag
// value limit.
const ACL_POLICY_TAG_KEY = "aclPolicy";

// Can be flexibly defined according to the use case.
//
// Examples:
// - USER_LIST: the users from a list stored in the database;
// - EMAIL_DOMAIN: the users whose email is in a specific domain;
// - GROUP_MEMBER: the users who are members of a specific group;
// - SUBSCRIBER: the users who are subscribers of a specific service / content
//   creator.
export enum ObjectAccessGroupType {}

export interface ObjectAccessGroup {
  type: ObjectAccessGroupType;
  // The logic id that identifies qualified group members. Format depends on the
  // ObjectAccessGroupType — e.g. a user-list DB id, an email domain, a group id.
  id: string;
}

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

export interface ObjectAclRule {
  group: ObjectAccessGroup;
  permission: ObjectPermission;
}

export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
  aclRules?: Array<ObjectAclRule>;
}

function isPermissionAllowed(
  requested: ObjectPermission,
  granted: ObjectPermission,
): boolean {
  if (requested === ObjectPermission.READ) {
    return [ObjectPermission.READ, ObjectPermission.WRITE].includes(granted);
  }
  return granted === ObjectPermission.WRITE;
}

abstract class BaseObjectAccessGroup implements ObjectAccessGroup {
  constructor(
    public readonly type: ObjectAccessGroupType,
    public readonly id: string,
  ) {}

  public abstract hasMember(userId: string): Promise<boolean>;
}

function createObjectAccessGroup(
  group: ObjectAccessGroup,
): BaseObjectAccessGroup {
  switch (group.type) {
    // Implement per access group type, e.g.:
    // case "USER_LIST":
    //   return new UserListAccessGroup(group.id);
    default:
      throw new Error(`Unknown access group type: ${group.type}`);
  }
}

function encodePolicy(policy: ObjectAclPolicy): string {
  return Buffer.from(JSON.stringify(policy), "utf8").toString("base64");
}

function decodePolicy(encoded: string): ObjectAclPolicy | null {
  try {
    const json = Buffer.from(encoded, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object" && typeof parsed.owner === "string") {
      return parsed as ObjectAclPolicy;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setObjectAclPolicy(
  objectFile: ObjectFile,
  aclPolicy: ObjectAclPolicy,
): Promise<void> {
  const [exists] = await objectFile.exists();
  if (!exists) {
    throw new Error(`Object not found: ${objectFile.name}`);
  }
  await objectFile.setTagging({ [ACL_POLICY_TAG_KEY]: encodePolicy(aclPolicy) });
}

export async function getObjectAclPolicy(
  objectFile: ObjectFile,
): Promise<ObjectAclPolicy | null> {
  let tags: Record<string, string>;
  try {
    tags = await objectFile.getTagging();
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return null;
    throw err;
  }
  const raw = tags[ACL_POLICY_TAG_KEY];
  if (!raw) return null;
  return decodePolicy(raw);
}

export async function canAccessObject({
  userId,
  objectFile,
  requestedPermission,
}: {
  userId?: string;
  objectFile: ObjectFile;
  requestedPermission: ObjectPermission;
}): Promise<boolean> {
  const aclPolicy = await getObjectAclPolicy(objectFile);
  if (!aclPolicy) {
    return false;
  }

  if (
    aclPolicy.visibility === "public" &&
    requestedPermission === ObjectPermission.READ
  ) {
    return true;
  }

  if (!userId) {
    return false;
  }

  if (aclPolicy.owner === userId) {
    return true;
  }

  for (const rule of aclPolicy.aclRules || []) {
    const accessGroup = createObjectAccessGroup(rule.group);
    if (
      (await accessGroup.hasMember(userId)) &&
      isPermissionAllowed(requestedPermission, rule.permission)
    ) {
      return true;
    }
  }

  return false;
}
