import { Node, Property, Relationship } from "@neo4j/graphql";
import { Individual } from "./individual.entity";

@Node("Family")
export class Family {
  @Property({ primary: true })
  id: string;

  @Property()
  gedcomId: string;

  @Relationship("HUSBAND", { direction: "IN" })
  husband?: Individual;

  @Relationship("WIFE", { direction: "IN" })
  wife?: Individual;

  @Relationship("CHILD", { direction: "IN" })
  children?: Individual[];

  @Property({ nullable: true })
  marriageDate?: string;

  @Property({ nullable: true })
  divorceDate?: string;
}
