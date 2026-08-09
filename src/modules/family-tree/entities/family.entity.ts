import { Individual } from "./individual.entity";

export class Family {
  id: string;
  gedcomId: string;
  husband?: Individual;
  wife?: Individual;
  children?: Individual[];
  marriageDate?: string;
  divorceDate?: string;
  marriagePlace?: string;
}
