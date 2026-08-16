import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Neo4jService } from "../../../neo4j/neo4j.service";
import { TreeRole, roleAtLeast } from "../enums/tree-role.enum";

export interface AccessibleTree {
  id: string;
  name: string;
  role: TreeRole;
}

export interface TreeMember {
  userId: string;
  email: string;
  name: string;
  role: TreeRole;
  joinedAt: string | null;
}

interface RoleLookup {
  treeExists: boolean;
  role: TreeRole | null;
}

@Injectable()
export class TreeAccessService {
  constructor(private readonly neo4j: Neo4jService) {}

  async getEffectiveRole(
    userId: string,
    treeId: string,
  ): Promise<TreeRole | null> {
    return (await this.lookupRole(userId, treeId)).role;
  }

  async assertMinRole(
    userId: string,
    treeId: string,
    min: TreeRole,
  ): Promise<TreeRole> {
    const access = await this.lookupRole(userId, treeId);
    if (!access.treeExists) {
      throw new NotFoundException("Tree not found");
    }
    if (!access.role || !roleAtLeast(access.role, min)) {
      throw new ForbiddenException("Insufficient tree access");
    }
    return access.role;
  }

  async listAccessibleTrees(userId: string): Promise<AccessibleTree[]> {
    const result = await this.neo4j.read(
      `
      MATCH (u:User {id: $userId})
      OPTIONAL MATCH (u)-[:OWNS]->(owned:Tree)
      OPTIONAL MATCH (u)-[membership:MEMBER_OF]->(member:Tree)
      WITH collect({
        id: owned.id,
        name: owned.name,
        role: $ownerRole
      }) + collect({
        id: member.id,
        name: member.name,
        role: membership.role
      }) AS rows
      UNWIND rows AS row
      WITH row
      WHERE row.id IS NOT NULL
      WITH row.id AS id, row.name AS name, collect(row.role) AS roles
      RETURN id, name,
        CASE WHEN $ownerRole IN roles THEN $ownerRole ELSE head(roles) END AS role
      ORDER BY name
      `,
      { userId, ownerRole: TreeRole.OWNER },
    );

    return result.records.map((record) => ({
      id: String(record.get("id")),
      name: String(record.get("name")),
      role: record.get("role") as TreeRole,
    }));
  }

  async listMembers(ownerId: string, treeId: string): Promise<TreeMember[]> {
    await this.assertMinRole(ownerId, treeId, TreeRole.OWNER);
    const result = await this.neo4j.read(
      `
      MATCH (owner:User)-[:OWNS]->(tree:Tree {id: $treeId})
      RETURN owner.id AS userId, owner.email AS email, owner.name AS name,
        $ownerRole AS role, null AS joinedAt
      UNION
      MATCH (member:User)-[membership:MEMBER_OF]->(tree:Tree {id: $treeId})
      WHERE NOT (member)-[:OWNS]->(tree)
      RETURN member.id AS userId, member.email AS email, member.name AS name,
        membership.role AS role, toString(membership.joinedAt) AS joinedAt
      `,
      { treeId, ownerRole: TreeRole.OWNER },
    );
    return result.records.map((record) => this.toTreeMember(record));
  }

  async removeMember(
    ownerId: string,
    treeId: string,
    memberUserId: string,
  ): Promise<{ removed: true }> {
    await this.assertMinRole(ownerId, treeId, TreeRole.OWNER);
    const targetRole = await this.getEffectiveRole(memberUserId, treeId);
    if (!targetRole) {
      throw new NotFoundException("Member not found");
    }
    if (targetRole === TreeRole.OWNER) {
      throw new BadRequestException("Cannot remove the tree owner");
    }
    await this.neo4j.write(
      `
      MATCH (:User {id: $memberUserId})-[membership:MEMBER_OF]->(:Tree {id: $treeId})
      DELETE membership
      `,
      { memberUserId, treeId },
    );
    return { removed: true };
  }

  private async lookupRole(userId: string, treeId: string): Promise<RoleLookup> {
    const result = await this.neo4j.read(
      `
      MATCH (tree:Tree {id: $treeId})
      OPTIONAL MATCH (owner:User {id: $userId})-[:OWNS]->(tree)
      OPTIONAL MATCH (:User {id: $userId})-[membership:MEMBER_OF]->(tree)
      RETURN owner IS NOT NULL AS isOwner, membership.role AS memberRole
      LIMIT 1
      `,
      { userId, treeId },
    );

    if (result.records.length === 0) {
      return { treeExists: false, role: null };
    }

    const record = result.records[0];
    if (record.get("isOwner")) {
      return { treeExists: true, role: TreeRole.OWNER };
    }

    return {
      treeExists: true,
      role: this.normalizeMemberRole(record.get("memberRole")),
    };
  }

  private toTreeMember(record: { get: (key: string) => unknown }): TreeMember {
    const joinedAt = record.get("joinedAt");
    return {
      userId: String(record.get("userId")),
      email: String(record.get("email")),
      name: String(record.get("name")),
      role: record.get("role") as TreeRole,
      joinedAt: joinedAt == null ? null : String(joinedAt),
    };
  }

  private normalizeMemberRole(role: unknown): TreeRole | null {
    if (role === TreeRole.EDITOR || role === TreeRole.VIEWER) {
      return role;
    }
    return null;
  }
}
