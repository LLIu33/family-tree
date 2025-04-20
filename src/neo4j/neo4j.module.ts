import { Module, DynamicModule, Global, Provider } from "@nestjs/common";
import { Neo4jService } from "./neo4j.service";
import { Neo4jConfig } from "./interfaces/neo4j-config.interface";
import { NEO4J_OPTIONS, NEO4J_DRIVER } from "./neo4j.constants";
import { ConfigModule } from "@nestjs/config";
import { createDriver } from "./neo4j.util";

@Global()
@Module({})
export class Neo4jModule {
  static forRoot(config: Neo4jConfig): DynamicModule {
    return {
      module: Neo4jModule,
      providers: [
        {
          provide: NEO4J_OPTIONS,
          useValue: config,
        },
        {
          provide: NEO4J_DRIVER,
          inject: [NEO4J_OPTIONS],
          useFactory: async (config: Neo4jConfig) => createDriver(config),
        },
        Neo4jService,
      ],
      exports: [Neo4jService],
    };
  }

  static forRootAsync(configProvider): DynamicModule {
    return {
      module: Neo4jModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: NEO4J_OPTIONS,
          ...configProvider,
        } as Provider<any>,
        {
          provide: NEO4J_DRIVER,
          inject: [NEO4J_OPTIONS],
          useFactory: async (config: Neo4jConfig) => createDriver(config),
        },
        Neo4jService,
      ],
      exports: [Neo4jService],
    };
  }
}
