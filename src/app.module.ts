import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { FamilyTreeModule } from "./modules/family-tree/family-tree.module";
import { AuthModule } from "./modules/auth/auth.module";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { Neo4jModule } from "./neo4j/neo4j.module";
import { Neo4jConfig } from "./neo4j/interfaces/neo4j-config.interface";
import {
  appConfig,
  neo4jConfig,
  storageConfig,
  swaggerConfig,
  jwtConfig,
} from "./config/configuration";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, neo4jConfig, storageConfig, swaggerConfig, jwtConfig],
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
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd =
          (config.get<string>("NODE_ENV") || process.env.NODE_ENV) ===
          "production";
        return {
          autoSchemaFile: true,
          playground: !isProd,
          introspection: !isProd,
        };
      },
    }),
    AuthModule,
    FamilyTreeModule,
  ],
})
export class AppModule {}
