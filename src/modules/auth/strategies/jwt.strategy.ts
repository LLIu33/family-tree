import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "../auth.service";
import { AuthUser, JwtPayload } from "../interfaces/auth.interface";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("jwt.secret") || config.get<string>("JWT_SECRET") || "dev-family-tree-secret-change-me",
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    return this.authService.getProfile(payload.sub, payload.treeId);
  }
}
