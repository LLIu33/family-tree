import { Individual } from "../entities";

export interface IndividualSummary {
  id: string;
  firstName?: string;
  lastName?: string;
  sex?: string;
  birthDate?: Date | string;
  deathDate?: Date | string;
  avatarUrl?: string;
  avatarMediaId?: string;
}

export interface IndividualRelatives {
  parents: IndividualSummary[];
  spouses: IndividualSummary[];
  children: IndividualSummary[];
}

export interface IndividualDetail extends Individual {
  relatives: IndividualRelatives;
  avatarUrl?: string;
  avatarMediaId?: string;
}
