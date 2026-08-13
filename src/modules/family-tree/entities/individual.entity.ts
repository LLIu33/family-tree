import { Node } from "neo4j-driver";
import { v4 as uuidV4 } from "uuid";
import { Sex } from "../enums/sex.enum";

export class Individual {
  id: string;
  gedcomId: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  namePrefix?: string;
  marriedName?: string;
  sex: Sex | string;
  birthDate?: Date;
  deathDate?: Date;
  birthPlace?: string;
  deathPlace?: string;
  deathCause?: string;
  burialPlace?: string;
  occupation?: string;
  retirementNote?: string;
  email?: string;
  biography?: string;
  extraEvents?: string;
  createdAt: Date;
  updatedAt: Date;
  relationships?: Array<{ type: string; node: unknown }>;

  constructor() {
    this.id = uuidV4();
    this.gedcomId = this.id;
    this.firstName = "";
    this.lastName = "";
    this.sex = Sex.UNKNOWN;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  static fromNeo4j(node: Node): Individual {
    const individual = new Individual();
    const properties = node.properties as Record<string, unknown>;

    individual.id = properties.id as string;
    individual.gedcomId = properties.gedcomId as string;
    individual.firstName = properties.firstName as string;
    individual.lastName = properties.lastName as string;
    individual.middleName = properties.middleName as string | undefined;
    individual.namePrefix = properties.namePrefix as string | undefined;
    individual.marriedName = properties.marriedName as string | undefined;
    individual.sex = properties.sex as string;
    individual.birthDate = properties.birthDate
      ? new Date(properties.birthDate as string)
      : undefined;
    individual.deathDate = properties.deathDate
      ? new Date(properties.deathDate as string)
      : undefined;
    individual.birthPlace = properties.birthPlace as string | undefined;
    individual.deathPlace = properties.deathPlace as string | undefined;
    individual.deathCause = properties.deathCause as string | undefined;
    individual.burialPlace = properties.burialPlace as string | undefined;
    individual.occupation = properties.occupation as string | undefined;
    individual.retirementNote = properties.retirementNote as string | undefined;
    individual.email = properties.email as string | undefined;
    individual.biography = properties.biography as string | undefined;
    individual.extraEvents = properties.extraEvents as string | undefined;
    individual.createdAt = properties.createdAt
      ? new Date(properties.createdAt as string)
      : new Date();
    individual.updatedAt = properties.updatedAt
      ? new Date(properties.updatedAt as string)
      : new Date();

    return individual;
  }

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  get isDeceased(): boolean {
    return !!this.deathDate;
  }

  get age(): number | undefined {
    if (!this.birthDate) return undefined;

    const today = new Date();
    const birthDate = new Date(this.birthDate);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    return age;
  }
}

export default Individual;
