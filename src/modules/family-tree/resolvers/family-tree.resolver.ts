import { Field, Int, ObjectType, Query, Resolver } from "@nestjs/graphql";
import { Individual } from "../entities/individual.entity";

@ObjectType()
class GedcomImportResult {
  @Field(() => Int)
  individuals: number;

  @Field(() => Int)
  families: number;
}

/** GraphQL kept minimal; tree mutations go through authenticated REST. */
@Resolver(() => Individual)
export class FamilyTreeResolver {
  @Query(() => String)
  async helloFamilyTree() {
    return "Родник API работает!";
  }
}

export { GedcomImportResult };
