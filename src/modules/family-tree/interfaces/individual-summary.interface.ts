import { Individual } from "../entities";

export interface IndividualSummary {
  id: string;
  firstName?: string;
  lastName?: string;
  sex?: string;
  birthDate?: Date | string;
  deathDate?: Date | string;
}

export interface IndividualRelatives {
  parents: IndividualSummary[];
  spouses: IndividualSummary[];
  children: IndividualSummary[];
}

export interface IndividualDetail extends Individual {
  relatives: IndividualRelatives;
}
