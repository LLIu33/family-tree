import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "crypto";
import { Neo4jService } from "../../neo4j/neo4j.service";
import { Neo4jResultUtils } from "../../common/utils/neo4j-result.utils";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { AuthUser, JwtPayload } from "./interfaces/auth.interface";
import { TreeRole } from "../trees/enums/tree-role.enum";
import { TreeAccessService } from "../trees/services/tree-access.service";

type UserNode = {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
};

type TreeNode = {
  id: string;
  name: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly neo4j: Neo4jService,
    private readonly jwtService: JwtService,
    private readonly treeAccess: TreeAccessService
  ) {}

  async register(dto: RegisterDto): Promise<{
    accessToken: string;
    user: AuthUser;
  }> {
    const existing = await this.findUserByEmail(dto.email);
    if (existing) {
      throw new ConflictException("Email already registered");
    }

    const userId = randomUUID();
    const treeId = randomUUID();
    const passwordHash = await (await import("bcrypt")).hash(dto.password, 10);
    const treeName = dto.treeName?.trim() || `Древо: ${dto.name}`;

    await this.neo4j.write(
      `
      CREATE (u:User {
        id: $userId,
        email: $email,
        passwordHash: $passwordHash,
        name: $name,
        createdAt: datetime()
      })
      CREATE (t:Tree {
        id: $treeId,
        name: $treeName,
        createdAt: datetime()
      })
      CREATE (u)-[:OWNS]->(t)
      `,
      {
        userId,
        email: dto.email.toLowerCase(),
        passwordHash,
        name: dto.name,
        treeId,
        treeName,
      }
    );

    const user: AuthUser = {
      userId,
      email: dto.email.toLowerCase(),
      name: dto.name,
      treeId,
      treeName,
      role: TreeRole.OWNER,
    };

    return { accessToken: await this.signToken(user), user };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; user: AuthUser }> {
    const row = await this.findUserWithTree(dto.email);
    if (!row) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const ok = await (await import("bcrypt")).compare(
      dto.password,
      row.user.passwordHash,
    );
    if (!ok) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const user: AuthUser = {
      userId: row.user.id,
      email: row.user.email,
      name: row.user.name,
      treeId: row.tree.id,
      treeName: row.tree.name,
      role: TreeRole.OWNER,
    };

    return { accessToken: await this.signToken(user), user };
  }

  async getProfile(userId: string, treeId: string): Promise<AuthUser> {
    const role = await this.treeAccess.getEffectiveRole(userId, treeId);
    if (role) {
      return this.getProfileForTree(userId, treeId, role);
    }

    return this.getOwnedProfile(userId);
  }

  async issueSessionForTree(
    userId: string,
    treeId: string
  ): Promise<{ accessToken: string; user: AuthUser }> {
    const user = await this.buildUserSession(userId, treeId);
    return { accessToken: await this.signToken(user), user };
  }

  private async buildUserSession(
    userId: string,
    treeId: string
  ): Promise<AuthUser> {
    const role = await this.treeAccess.assertMinRole(
      userId,
      treeId,
      TreeRole.VIEWER
    );
    return this.getProfileForTree(userId, treeId, role);
  }

  private async getProfileForTree(
    userId: string,
    treeId: string,
    role: TreeRole
  ): Promise<AuthUser> {
    const result = await this.neo4j.read(
      `
      MATCH (u:User {id: $userId}), (t:Tree {id: $treeId})
      RETURN u, t
      LIMIT 1
      `,
      { userId, treeId }
    );
    if (result.records.length === 0) {
      throw new UnauthorizedException("User not found");
    }
    return this.toAuthUser(result.records[0], role);
  }

  private async getOwnedProfile(userId: string): Promise<AuthUser> {
    const result = await this.neo4j.read(
      `
      MATCH (u:User {id: $userId})-[:OWNS]->(t:Tree)
      RETURN u, t
      LIMIT 1
      `,
      { userId }
    );
    if (result.records.length === 0) {
      throw new UnauthorizedException("User not found");
    }
    return this.toAuthUser(result.records[0], TreeRole.OWNER);
  }

  private toAuthUser(
    record: { get: (key: string) => unknown },
    role: TreeRole
  ): AuthUser {
    const user = Neo4jResultUtils.normalizeValue(
      record.get("u")
    ) as UserNode;
    const tree = Neo4jResultUtils.normalizeValue(
      record.get("t")
    ) as TreeNode;
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      treeId: tree.id,
      treeName: tree.name,
      role,
    };
  }

  private async signToken(user: AuthUser): Promise<string> {
    const payload: JwtPayload = {
      sub: user.userId,
      email: user.email,
      treeId: user.treeId,
      role: user.role,
    };
    return this.jwtService.signAsync(payload);
  }

  private async findUserByEmail(email: string): Promise<UserNode | null> {
    const result = await this.neo4j.read(
      `MATCH (u:User {email: $email}) RETURN u LIMIT 1`,
      { email: email.toLowerCase() }
    );
    if (result.records.length === 0) return null;
    return Neo4jResultUtils.normalizeValue(
      result.records[0].get("u")
    ) as UserNode;
  }

  private async findUserWithTree(
    email: string
  ): Promise<{ user: UserNode; tree: TreeNode } | null> {
    const result = await this.neo4j.read(
      `
      MATCH (u:User {email: $email})-[:OWNS]->(t:Tree)
      RETURN u, t
      LIMIT 1
      `,
      { email: email.toLowerCase() }
    );
    if (result.records.length === 0) return null;
    return {
      user: Neo4jResultUtils.normalizeValue(
        result.records[0].get("u")
      ) as UserNode,
      tree: Neo4jResultUtils.normalizeValue(
        result.records[0].get("t")
      ) as TreeNode,
    };
  }
}
