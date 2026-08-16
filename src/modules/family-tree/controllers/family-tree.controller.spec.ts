import "reflect-metadata";
import { Reflector } from "@nestjs/core";
import { FamilyTreeController } from "./family-tree.controller";
import { MediaController } from "./media.controller";
import { MIN_ROLE_KEY } from "../../trees/decorators/min-role.decorator";
import { TreeRole } from "../../trees/enums/tree-role.enum";
import { AuthUser } from "../../auth/interfaces/auth.interface";
import { FamilyTreeService } from "../services/family-tree.service";
import { MediaService } from "../services/media.service";
import { GedcomParserService } from "../services/gedcom-parser.service";
import { GedcomExportService } from "../services/gedcom-export.service";

describe("family-tree MinRole annotations", () => {
  const reflector = new Reflector();

  it.each([
    ["searchIndividuals", TreeRole.VIEWER],
    ["getFullGraph", TreeRole.VIEWER],
    ["getIndividual", TreeRole.VIEWER],
    ["getAncestors", TreeRole.VIEWER],
    ["getDescendants", TreeRole.VIEWER],
    ["getFamily", TreeRole.VIEWER],
    ["exportGedcom", TreeRole.VIEWER],
    ["visualizeTree", TreeRole.VIEWER],
    ["createIndividual", TreeRole.EDITOR],
    ["addChild", TreeRole.EDITOR],
    ["updateIndividual", TreeRole.EDITOR],
    ["createFamily", TreeRole.EDITOR],
    ["createRelationship", TreeRole.EDITOR],
    ["uploadMedia", TreeRole.EDITOR],
    ["importGedcom", TreeRole.EDITOR],
  ] as const)(
    "requires %s to be %s",
    (method, role) => {
      expect(
        reflector.get(MIN_ROLE_KEY, FamilyTreeController.prototype[method]),
      ).toBe(role);
    },
  );

  it.each([
    ["getMedia", TreeRole.VIEWER],
    ["uploadMedia", TreeRole.EDITOR],
    ["deleteMedia", TreeRole.EDITOR],
  ] as const)(
    "requires media %s to be %s",
    (method, role) => {
      expect(
        reflector.get(MIN_ROLE_KEY, MediaController.prototype[method]),
      ).toBe(role);
    },
  );
});

describe("family-tree controller role forwarding", () => {
  const user: AuthUser = {
    userId: "user-1",
    email: "ada@example.com",
    name: "Ada",
    treeId: "tree-2",
    treeName: "Shared Tree",
    role: TreeRole.VIEWER,
  };

  it("passes the current user role into getFullGraph", async () => {
    const familyTreeService = {
      getFullGraph: jest.fn().mockResolvedValue({ nodes: [] }),
    };
    const controller = new FamilyTreeController(
      familyTreeService as unknown as FamilyTreeService,
      {} as MediaService,
      {} as GedcomParserService,
      {} as GedcomExportService,
    );

    await controller.getFullGraph(user);

    expect(familyTreeService.getFullGraph).toHaveBeenCalledWith(
      "tree-2",
      TreeRole.VIEWER,
    );
  });

  it("passes the current user role into searchIndividuals", async () => {
    const familyTreeService = {
      searchIndividuals: jest.fn().mockResolvedValue([]),
    };
    const controller = new FamilyTreeController(
      familyTreeService as unknown as FamilyTreeService,
      {} as MediaService,
      {} as GedcomParserService,
      {} as GedcomExportService,
    );

    await controller.searchIndividuals(user, "ada", 20);

    expect(familyTreeService.searchIndividuals).toHaveBeenCalledWith(
      "tree-2",
      "ada",
      20,
      TreeRole.VIEWER,
    );
  });
});
