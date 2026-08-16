import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { FamilyTreeModule } from "./modules/family-tree/family-tree.module";
import { AuthModule } from "./modules/auth/auth.module";
import { TreesModule } from "./modules/trees/trees.module";
import { Neo4jModule } from "./neo4j/neo4j.module";
import { Neo4jConfig } from "./neo4j/interfaces/neo4j-config.interface";
import { HealthController } from "./health.controller";
import { AuthThrottleConfig } from "./config/auth-throttle.config";
import {
  appConfig,
  neo4jConfig,
  storageConfig,
  swaggerConfig,
  jwtConfig,
  authThrottleConfig,
} from "./config/configuration";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        neo4jConfig,
        storageConfig,
        swaggerConfig,
        jwtConfig,
        authThrottleConfig,
      ],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const throttle = config.get<AuthThrottleConfig>("authThrottle") ?? {
          ttlMs: 60_000,
          loginLimit: 5,
          registerLimit: 3,
        };
        return [
          {
            name: "login",
            ttl: throttle.ttlMs,
            limit: throttle.loginLimit,
          },
          {
            name: "register",
            ttl: throttle.ttlMs,
            limit: throttle.registerLimit,
          },
        ];
      },
    }),
    Neo4jModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): Neo4jConfig => ({
        uri:
          config.get<string>("neo4j.uri") ||
          config.get<string>("NEO4J_URI") ||
          undefined,
        scheme:
          config.get<string>("neo4j.scheme") ||
          config.get<string>("NEO4J_SCHEME") ||
          "bolt",
        host:
          config.get<string>("neo4j.host") ||
          config.get<string>("NEO4J_HOST") ||
          "localhost",
        port: Number(
          config.get("neo4j.port") || config.get("NEO4J_PORT") || 7687
        ),
        username:
          config.get<string>("neo4j.username") ||
          config.get<string>("NEO4J_USERNAME") ||
          "neo4j",
        password:
          config.get<string>("neo4j.password") ||
          config.get<string>("NEO4J_PASSWORD") ||
          "your_password",
        database:
          config.get<string>("neo4j.database") ||
          config.get<string>("NEO4J_DATABASE") ||
          "neo4j",
      }),
    }),
    AuthModule,
    TreesModule,
    FamilyTreeModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
