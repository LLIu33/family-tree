import {
  readGedcom,
  writeGedcom,
  type EventOrAttribute,
  type Family as GedcomFamily,
  type GedcomDate,
  type GedcomFile,
  type Individual as GedcomIndividual,
  type NoteRef,
  type PersonalName,
  type Sex as GedcomSex,
} from "gedcom-typescript";
import { Family, Individual } from "../entities";
import { Sex } from "../enums/sex.enum";

const EMPTY_GEDCOM_SEED = `0 HEAD
1 GEDC
2 VERS 5.5.5
1 CHAR UTF-8
0 TRLR
`;

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

type XrefKind = "I" | "F";
type IndividualXrefs = Map<string, string>;

export function toGedcomXref(rawId: string, kind: XrefKind): string {
  let core = (rawId || "").trim();
  if (core.startsWith("@") && core.endsWith("@") && core.length > 2) {
    core = core.slice(1, -1);
  }
  core = core.replace(/[^A-Za-z0-9_-]/g, "_");
  if (!core.startsWith(kind)) {
    core = `${kind}${core}`;
  }
  return `@${core}@`;
}

export function formatGedcomDate(
  value: Date | string | undefined | null
): GedcomDate | undefined {
  if (!value) return undefined;

  if (value instanceof Date) {
    return {
      type: "exact",
      date: {
        day: value.getUTCDate(),
        month: MONTHS[value.getUTCMonth()],
        year: value.getUTCFullYear(),
      },
    };
  }

  const text = value.trim();
  if (!text) return undefined;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (isoMatch) {
    return {
      type: "exact",
      date: {
        day: Number(isoMatch[3]),
        month: MONTHS[Number(isoMatch[2]) - 1],
        year: Number(isoMatch[1]),
      },
    };
  }

  return { type: "phrase", text };
}

export function buildGedcomFile(input: {
  individuals: Individual[];
  families: Family[];
}): GedcomFile {
  const file = createEmptyGedcomFile();
  const individualXrefs = mapIndividualXrefs(input.individuals);

  for (const individual of input.individuals) {
    const gedcomIndividual = mapIndividual(individual, individualXrefs);
    file.individuals.set(gedcomIndividual.xref, gedcomIndividual);
  }

  for (const family of input.families) {
    const gedcomFamily = mapFamily(family, individualXrefs);
    file.families.set(gedcomFamily.xref, gedcomFamily);
    wireFamilyLinks(file.individuals, gedcomFamily);
  }

  file.individualIndex = input.individuals.map((individual) => {
    const xref = getIndividualXref(individual, individualXrefs)!;
    return { xref, name: formatDisplayName(individual) };
  });
  file.familyIndex = Array.from(file.families.values()).map((family) => ({
    xref: family.xref,
    label: family.xref,
  }));

  return file;
}

export function serializeGedcomFile(file: GedcomFile): string {
  return relocateMarriedNamesUnderName(writeGedcom(file));
}

export function relocateMarriedNamesUnderName(text: string): string {
  return text
    .split(/(?=^0\s)/m)
    .map((record) => {
      if (!/^0\s+@[^@]+@\s+INDI\b/.test(record)) return record;
      const lines = record.split("\n");
      const nameIndex = lines.findIndex((line) => /^1 NAME\b/.test(line));
      if (nameIndex === -1) return record;

      const marriedNames = lines.filter((line) => /^1 _MARNM\b/.test(line));
      if (!marriedNames.length) return record;

      const kept = lines.filter((line) => !/^1 _MARNM\b/.test(line));
      const keptNameIndex = kept.findIndex((line) => /^1 NAME\b/.test(line));
      const nextLevelOne = kept.findIndex(
        (line, index) => index > keptNameIndex && /^1\s/.test(line)
      );
      const insertAt = nextLevelOne === -1 ? kept.length : nextLevelOne;
      kept.splice(insertAt, 0, ...marriedNames.map((line) => line.replace(/^1 /, "2 ")));
      return kept.join("\n");
    })
    .join("");
}

function createEmptyGedcomFile(): GedcomFile {
  const file = readGedcom(EMPTY_GEDCOM_SEED);
  file.header.sourceSystem.id = "RODNIK";
  file.header.sourceSystem.name = "Rodnik";
  file.header.sourceSystem.version = "1.0.0";
  file.sources = new Map();
  file.repositories = new Map();
  file.notes = new Map();
  file.multimedia = new Map();
  return file;
}

function mapIndividualXrefs(individuals: Individual[]): IndividualXrefs {
  const xrefs: IndividualXrefs = new Map();
  for (const individual of individuals) {
    const xref = toGedcomXref(individual.gedcomId || individual.id, "I");
    for (const key of individualLookupKeys(individual)) {
      xrefs.set(key, xref);
    }
  }
  return xrefs;
}

function individualLookupKeys(individual: Individual): string[] {
  return [individual.gedcomId, individual.id].filter((key) => Boolean(key?.trim()));
}

function getIndividualXref(
  individual: Individual,
  xrefs: IndividualXrefs
): string | undefined {
  for (const key of individualLookupKeys(individual)) {
    const xref = xrefs.get(key);
    if (xref) return xref;
  }
  return undefined;
}

function mapIndividual(
  individual: Individual,
  xrefs: IndividualXrefs
): GedcomIndividual {
  const notes = buildIndividualNotes(individual);
  return {
    xref: getIndividualXref(individual, xrefs)!,
    names: [mapName(individual)],
    sex: mapSex(individual.sex),
    birth: mapEvent(individual.birthDate, individual.birthPlace),
    death: mapEvent(individual.deathDate, individual.deathPlace, individual.deathCause),
    burial: mapEvent(undefined, individual.burialPlace),
    occupation: mapValueEvent(individual.occupation),
    retirement: mapValueEvent(individual.retirementNote),
    residence: mapEmailResidence(individual.email),
    familiesAsChild: [],
    familiesAsSpouse: [],
    notes,
    events: mapExtraEvents(individual.extraEvents),
    extensions: individual.marriedName
      ? [{ tag: "_MARNM", value: individual.marriedName, children: [] }]
      : undefined,
  };
}

function mapName(individual: Individual): PersonalName {
  const given = [individual.firstName, individual.middleName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const surname = individual.lastName?.trim() || "Unknown";

  return {
    value: `${given || "Unknown"} /${surname}/`,
    prefix: individual.namePrefix,
    given: given || undefined,
    surname,
  };
}

function mapFamily(
  family: Family,
  individualXrefs: IndividualXrefs
): GedcomFamily {
  return {
    xref: toGedcomXref(family.gedcomId || family.id, "F"),
    husband: family.husband ? getIndividualXref(family.husband, individualXrefs) : undefined,
    wife: family.wife ? getIndividualXref(family.wife, individualXrefs) : undefined,
    children: (family.children || [])
      .map((child) => getIndividualXref(child, individualXrefs))
      .filter((xref): xref is string => Boolean(xref)),
    marriage: mapEvent(family.marriageDate, family.marriagePlace),
    divorce: mapEvent(family.divorceDate),
  };
}

function wireFamilyLinks(
  individuals: Map<string, GedcomIndividual>,
  family: GedcomFamily
): void {
  for (const spouse of [family.husband, family.wife]) {
    if (spouse) {
      individuals.get(spouse)?.familiesAsSpouse.push({ family: family.xref });
    }
  }
  for (const child of family.children) {
    individuals.get(child)?.familiesAsChild.push({ family: family.xref });
  }
}

function mapEvent(
  dateValue?: Date | string,
  placeValue?: string,
  cause?: string
): EventOrAttribute | undefined {
  const date = formatGedcomDate(dateValue);
  const place = placeValue?.trim();
  if (!date && !place && !cause) return undefined;
  return {
    date,
    place: place ? { name: place } : undefined,
    cause,
  };
}

function mapValueEvent(value?: string): EventOrAttribute | undefined {
  const trimmed = value?.trim();
  return trimmed ? { value: trimmed } : undefined;
}

function mapEmailResidence(email?: string): EventOrAttribute[] | undefined {
  const trimmed = email?.trim();
  return trimmed ? [{ address: { emails: [trimmed] } }] : undefined;
}

function buildIndividualNotes(individual: Individual): NoteRef[] | undefined {
  const notes = [individual.biography]
    .filter((text): text is string => Boolean(text?.trim()))
    .map((text) => ({ type: "inline" as const, text: text.trim() }));
  return notes.length ? notes : undefined;
}

function mapExtraEvents(extraEvents?: string): EventOrAttribute[] | undefined {
  const trimmed = extraEvents?.trim();
  return trimmed ? [{ notes: [{ type: "inline", text: trimmed }] }] : undefined;
}

function mapSex(value: Sex | string): GedcomSex {
  if (value === Sex.MALE || value === "M") return "M";
  if (value === Sex.FEMALE || value === "F") return "F";
  if (value === "X") return "X";
  return "U";
}

function formatDisplayName(individual: Individual): string {
  return [individual.firstName, individual.middleName, individual.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
}
