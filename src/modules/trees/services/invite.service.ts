import { Inject, Injectable, NotFoundException, forwardRef } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "crypto";
import { AuthService } from "../../auth/auth.service";
import { Neo4jService } from "../../../neo4j/neo4j.service";
import { TreeRole } from "../enums/tree-role.enum";
import { TreeAccessService } from "./tree-access.service";

type InviteRole = TreeRole.EDITOR | TreeRole.VIEWER;

export type CreatedInvite = {
  id: string;
  token: string;
  inviteUrl: string;
  role: InviteRole;
  expiresAt: string;
};

export type ListedInvite = {
  id: string;
  role: InviteRole;
  expiresAt: string;
  createdAt: string;
};

@Injectable()
export class InviteService {
  constructor(
    private readonly neo4j: Neo4jService,
    private readonly treeAccess: TreeAccessService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) {}

  async createInvite(
    ownerId: string,
    treeId: string,
    role: InviteRole,
    expiresInDays = 14,
  ): Promise<CreatedInvite> {
    await this.treeAccess.assertMinRole(ownerId, treeId, TreeRole.OWNER);
    const token = randomBytes(32).toString("base64url");
    const result = await this.neo4j.write(this.createInviteQuery(), {
      id: randomUUID(),
      tokenHash: this.hashToken(token),
      role,
      expiresAt: this.expiryIso(expiresInDays),
      ownerId,
      treeId,
    });
    const record = result.records[0];
    return {
      id: String(record.get("id")),
      token,
      inviteUrl: `/invite/${token}`,
      role: record.get("role") as InviteRole,
      expiresAt: String(record.get("expiresAt")),
    };
  }

  async listInvites(ownerId: string, treeId: string): Promise<ListedInvite[]> {
    await this.treeAccess.assertMinRole(ownerId, treeId, TreeRole.OWNER);
    const result = await this.neo4j.read(
      `
      MATCH (invite:Invite)-[:FOR_TREE]->(:Tree {id: $treeId})
      WHERE invite.revokedAt IS NULL AND invite.expiresAt > datetime()
      RETURN invite.id AS id, invite.role AS role,
        toString(invite.expiresAt) AS expiresAt,
        toString(invite.createdAt) AS createdAt
      ORDER BY invite.createdAt DESC
      `,
      { treeId },
    );
    return result.records.map((record) => this.toListedInvite(record));
  }

  async revokeInvite(ownerId: string, treeId: string, inviteId: string) {
    await this.treeAccess.assertMinRole(ownerId, treeId, TreeRole.OWNER);
    const result = await this.neo4j.write(
      `
      MATCH (invite:Invite {id: $inviteId})-[:FOR_TREE]->(:Tree {id: $treeId})
      WHERE invite.revokedAt IS NULL
      SET invite.revokedAt = datetime()
      RETURN invite.id AS id
      `,
      { inviteId, treeId },
    );
    if (result.records.length === 0) throw new NotFoundException("Invite not found");
    return { id: String(result.records[0].get("id")), revoked: true };
  }

  async acceptInvite(userId: string, rawToken: string) {
    const invite = await this.findAcceptableInvite(rawToken);
    await this.createMembership(userId, invite.treeId, invite.role);
    return this.authService.issueSessionForTree(userId, invite.treeId);
  }

  private async findAcceptableInvite(rawToken: string) {
    const result = await this.neo4j.read(
      `
      MATCH (invite:Invite {tokenHash: $tokenHash})-[:FOR_TREE]->(tree:Tree)
      WHERE invite.revokedAt IS NULL AND invite.expiresAt > datetime()
      RETURN invite.id AS id, tree.id AS treeId, invite.role AS role
      LIMIT 1
      `,
      { tokenHash: this.hashToken(rawToken) },
    );
    if (result.records.length === 0) throw new NotFoundException("Invite not found");
    return {
      id: String(result.records[0].get("id")),
      treeId: String(result.records[0].get("treeId")),
      role: result.records[0].get("role") as InviteRole,
    };
  }

  private async createMembership(
    userId: string,
    treeId: string,
    role: InviteRole,
  ): Promise<void> {
    await this.neo4j.write(
      `
      MATCH (user:User {id: $userId}), (tree:Tree {id: $treeId})
      OPTIONAL MATCH (user)-[owns:OWNS]->(tree)
      OPTIONAL MATCH (user)-[membership:MEMBER_OF]->(tree)
      FOREACH (_ IN CASE WHEN owns IS NULL AND membership IS NULL THEN [1] ELSE [] END |
        MERGE (user)-[newMembership:MEMBER_OF]->(tree)
        ON CREATE SET newMembership.role = $role,
          newMembership.joinedAt = datetime()
      )
      `,
      { userId, treeId, role },
    );
  }

  private createInviteQuery(): string {
    return `
      MATCH (owner:User {id: $ownerId}), (tree:Tree {id: $treeId})
      CREATE (invite:Invite {
        id: $id,
        tokenHash: $tokenHash,
        role: $role,
        expiresAt: datetime($expiresAt),
        createdAt: datetime()
      })
      CREATE (invite)-[:FOR_TREE]->(tree)
      CREATE (invite)-[:CREATED_BY]->(owner)
      RETURN invite.id AS id, invite.role AS role, toString(invite.expiresAt) AS expiresAt
    `;
  }

  private toListedInvite(record: { get: (key: string) => unknown }): ListedInvite {
    return {
      id: String(record.get("id")),
      role: record.get("role") as InviteRole,
      expiresAt: String(record.get("expiresAt")),
      createdAt: String(record.get("createdAt")),
    };
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private expiryIso(expiresInDays: number): string {
    return new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  }
}
