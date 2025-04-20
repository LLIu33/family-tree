import { Resolver, Query, Mutation, Args } from "@nestjs/graphql";
import { FamilyTreeService } from "../services/family-tree.service";
import { GedcomParserService } from "../services/gedcom-parser.service";
import { Individual } from "../entities/individual.entity";

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

  @Query(() => Object)
  async getAncestors(
    @Args("individualId") individualId: string,
    @Args("generations", { nullable: true }) generations: number
  ) {
    return this.familyTreeService.getAncestors(individualId, generations);
  }

  @Query(() => Object)
  async getDescendants(
    @Args("individualId") individualId: string,
    @Args("generations", { nullable: true }) generations: number
  ) {
    return this.familyTreeService.getDescendants(individualId, generations);
  }

  @Mutation(() => Object)
  async importGedcom(@Args("gedcomData") gedcomData: string) {
    return this.gedcomParserService.parseAndImport(gedcomData);
  }
}
