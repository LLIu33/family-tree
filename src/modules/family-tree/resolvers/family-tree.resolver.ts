import { Field, Int, ObjectType } from "@nestjs/graphql";
import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import { FamilyTreeService } from "../services/family-tree.service";
import { GedcomParserService } from "../services/gedcom-parser.service";
import { Individual } from "../entities/individual.entity";

@ObjectType()
class GedcomImportResult {
  @Field(() => Int)
  individuals: number;

  @Field(() => Int)
  families: number;
}

@Resolver(() => Individual)
export class FamilyTreeResolver {
  constructor(
    private readonly familyTreeService: FamilyTreeService,
    private readonly gedcomParserService: GedcomParserService
  ) {}

  @Query(() => String)
  async helloFamilyTree() {
    return "Family Tree API is working!";
  }

  @Query(() => [Individual])
  async getAncestors(
    @Args("individualId") individualId: string,
    @Args("generations", { type: () => Int, nullable: true }) generations?: number
  ) {
    return this.familyTreeService.getAncestors(individualId, generations ?? 3);
  }

  @Query(() => [Individual])
  async getDescendants(
    @Args("individualId") individualId: string,
    @Args("generations", { type: () => Int, nullable: true }) generations?: number
  ) {
    return this.familyTreeService.getDescendants(individualId, generations ?? 3);
  }

  @Mutation(() => GedcomImportResult)
  async importGedcom(@Args("gedcomData") gedcomData: string) {
    return this.gedcomParserService.parseAndImport(gedcomData);
  }
}
