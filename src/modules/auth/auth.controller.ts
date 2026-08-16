import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SkipThrottle, ThrottlerGuard } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { CurrentUser } from "./decorators/current-user.decorator";
import { AuthUser } from "./interfaces/auth.interface";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ login: true })
  @ApiOperation({ summary: "Register user and create a personal tree" })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post("login")
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ register: true })
  @ApiOperation({ summary: "Login" })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Current user profile" })
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
