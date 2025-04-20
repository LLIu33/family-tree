import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { FamilyTreeModule } from "./modules/family-tree/family-tree.module";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { Neo4jModule } from "./neo4j/neo4j.module";
import {
  appConfig,
  neo4jConfig,
  storageConfig,
  swaggerConfig,
} from "./config/configuration";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, neo4jConfig, storageConfig, swaggerConfig],
    }),
    Neo4jModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        scheme: config.get("NEO4J_SCHEME"),
        host: config.get("NEO4J_HOST"),
        port: config.get("NEO4J_PORT"),
        username: config.get("NEO4J_USERNAME"),
        password: config.get("NEO4J_PASSWORD"),
        database: config.get("NEO4J_DATABASE"),
      }),
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      playground: true,
    }),
    FamilyTreeModule,
  ],
})
export class AppModule {}
