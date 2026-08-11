import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { Neo4jService } from "../../neo4j/neo4j.service";
import { Neo4jResultUtils } from "../../common/utils/neo4j-result.utils";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { AuthUser, JwtPayload } from "./interfaces/auth.interface";

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
    private readonly jwtService: JwtService
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
    const passwordHash = await bcrypt.hash(dto.password, 10);
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
    };

    return { accessToken: await this.signToken(user), user };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; user: AuthUser }> {
    const row = await this.findUserWithTree(dto.email);
    if (!row) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const ok = await bcrypt.compare(dto.password, row.user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const user: AuthUser = {
      userId: row.user.id,
      email: row.user.email,
      name: row.user.name,
      treeId: row.tree.id,
      treeName: row.tree.name,
    };

    return { accessToken: await this.signToken(user), user };
  }

  async getProfile(userId: string): Promise<AuthUser> {
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
    const user = Neo4jResultUtils.normalizeValue(
      result.records[0].get("u")
    ) as UserNode;
    const tree = Neo4jResultUtils.normalizeValue(
      result.records[0].get("t")
    ) as TreeNode;
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      treeId: tree.id,
      treeName: tree.name,
    };
  }

  private async signToken(user: AuthUser): Promise<string> {
    const payload: JwtPayload = {
      sub: user.userId,
      email: user.email,
      treeId: user.treeId,
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
