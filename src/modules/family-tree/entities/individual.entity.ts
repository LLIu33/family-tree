import { Node } from 'neo4j-driver';
import { generate } from 'shortid';
import { Neo4jGraphQL } from '@neo4j/graphql';
import { Sex } from 'gedcom-ts';

const typeDefs = `
  enum Sex {
    MALE
    FEMALE
    UNKNOWN
  }

  type Individual {
    id: ID! @id
    gedcomId: String!
    firstName: String!
    lastName: String!
    middleName: String
    sex: Sex!
    birthDate: DateTime
    deathDate: DateTime
    birthPlace: String
    deathPlace: String
    occupation: String
    biography: String
    createdAt: DateTime! @timestamp(operations: [CREATE])
    updatedAt: DateTime! @timestamp(operations: [UPDATE])
    fullName: String! @computed
    isDeceased: Boolean! @computed
    age: Int @computed
    
    parents: [Family!]! @relationship(type: "CHILD_OF", direction: OUT)
    spouses: [Individual!]! @relationship(type: "SPOUSE", direction: BOTH)
    siblings: [Individual!]! @relationship(type: "SIBLING", direction: BOTH)
    media: [Media!]! @relationship(type: "HAS_MEDIA", direction: OUT)
  }
`;

export class Individual {
  id: string;
  gedcomId: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  sex: Sex
  birthDate?: Date;
  deathDate?: Date;
  birthPlace?: string;
  deathPlace?: string;
  occupation?: string;
  biography?: string;
  createdAt: Date;
  updatedAt: Date;

  constructor() {
    this.id = generate();
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  static fromNeo4j(node: Node): Individual {
    const individual = new Individual();
    const properties = node.properties as Record<string, any>;
    
    individual.id = properties.id;
    individual.gedcomId = properties.gedcomId;
    individual.firstName = properties.firstName;
    individual.lastName = properties.lastName;
    individual.middleName = properties.middleName;
    individual.sex = properties.sex;
    individual.birthDate = properties.birthDate ? new Date(properties.birthDate) : undefined;
    individual.deathDate = properties.deathDate ? new Date(properties.deathDate) : undefined;
    individual.birthPlace = properties.birthPlace;
    individual.deathPlace = properties.deathPlace;
    individual.occupation = properties.occupation;
    individual.biography = properties.biography;
    individual.createdAt = new Date(properties.createdAt);
    individual.updatedAt = new Date(properties.updatedAt);

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
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  }
}

// Инициализация Neo4jGraphQL
const neoSchema = new Neo4jGraphQL({
  typeDefs,
  driver: /* ваш Neo4j driver */,
  resolvers: {
    Individual: {
      fullName: (parent) => parent.fullName,
      isDeceased: (parent) => parent.isDeceased,
      age: (parent) => parent.age
    }
  }
});

export default Individual;