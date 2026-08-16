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

  it("forwards CRUD and graph endpoints to familyTreeService", async () => {
    const familyTreeService = {
      createIndividual: jest.fn().mockResolvedValue({ id: "i1" }),
      getIndividual: jest.fn().mockResolvedValue({ id: "i1" }),
      addChild: jest.fn().mockResolvedValue({ child: { id: "c1" } }),
      updateIndividual: jest.fn().mockResolvedValue({ id: "i1" }),
      getAncestors: jest.fn().mockResolvedValue([]),
      getDescendants: jest.fn().mockResolvedValue([]),
      createFamily: jest.fn().mockResolvedValue({ id: "f1" }),
      getFamily: jest.fn().mockResolvedValue({ id: "f1" }),
      createRelationship: jest.fn().mockResolvedValue(true),
      visualizeTree: jest.fn().mockResolvedValue({ nodes: [], relationships: [] }),
    };
    const controller = new FamilyTreeController(
      familyTreeService as unknown as FamilyTreeService,
      {} as MediaService,
      {} as GedcomParserService,
      {} as GedcomExportService,
    );

    await controller.createIndividual(user, { firstName: "Ada" } as any);
    await controller.getIndividual(user, "i1");
    await controller.addChild(user, "i1", { firstName: "Child" } as any);
    await controller.updateIndividual(user, "i1", { firstName: "Ada" } as any);
    await controller.getAncestors(user, "i1", 2);
    await controller.getDescendants(user, "i1", 2);
    await controller.createFamily(user, { husbandId: "i1" } as any);
    await controller.getFamily(user, "f1");
    await controller.createRelationship(user, {
      fromIndividualId: "a",
      toIndividualId: "b",
    } as any);
    await controller.visualizeTree(user, "i1", 3);

    expect(familyTreeService.createIndividual).toHaveBeenCalledWith(
      "tree-2",
      expect.objectContaining({ firstName: "Ada" }),
    );
    expect(familyTreeService.getIndividual).toHaveBeenCalledWith("tree-2", "i1");
    expect(familyTreeService.addChild).toHaveBeenCalledWith(
      "tree-2",
      "i1",
      expect.any(Object),
    );
    expect(familyTreeService.visualizeTree).toHaveBeenCalledWith(
      "tree-2",
      "i1",
      3,
    );
  });

  it("throws NotFoundException when individual is missing", async () => {
    const familyTreeService = {
      getIndividual: jest.fn().mockResolvedValue(null),
    };
    const controller = new FamilyTreeController(
      familyTreeService as unknown as FamilyTreeService,
      {} as MediaService,
      {} as GedcomParserService,
      {} as GedcomExportService,
    );

    await expect(controller.getIndividual(user, "missing")).rejects.toThrow(
      "Individual missing not found",
    );
  });

  it("forwards media, export, and import endpoints", async () => {
    const mediaService = {
      createMedia: jest.fn().mockResolvedValue({ id: "m1" }),
    };
    const gedcomExportService = {
      exportTree: jest.fn().mockResolvedValue("0 HEAD"),
    };
    const gedcomParserService = {
      parseAndImport: jest.fn().mockResolvedValue({ imported: 1 }),
    };
    const controller = new FamilyTreeController(
      {} as FamilyTreeService,
      mediaService as unknown as MediaService,
      gedcomParserService as unknown as GedcomParserService,
      gedcomExportService as unknown as GedcomExportService,
    );
    const file = {
      buffer: Buffer.from("0 HEAD\n0 TRLR"),
    } as Express.Multer.File;

    await controller.uploadMedia(user, "indi-1", file, "desc", new Date("2000-01-01"));
    await controller.exportGedcom(user);
    await controller.importGedcom(user, file, { source: "test" } as any);

    expect(mediaService.createMedia).toHaveBeenCalledWith(
      "tree-2",
      file,
      expect.objectContaining({
        attachedToId: "indi-1",
        description: "desc",
        dateTaken: "2000-01-01T00:00:00.000Z",
      }),
    );
    expect(gedcomExportService.exportTree).toHaveBeenCalledWith("tree-2");
    expect(gedcomParserService.parseAndImport).toHaveBeenCalledWith(
      "tree-2",
      "0 HEAD\n0 TRLR",
      "test",
    );
  });

  it("rejects import without a GEDCOM file buffer", async () => {
    const controller = new FamilyTreeController(
      {} as FamilyTreeService,
      {} as MediaService,
      {} as GedcomParserService,
      {} as GedcomExportService,
    );

    await expect(
      controller.importGedcom(user, undefined as any, {} as any),
    ).rejects.toThrow("GEDCOM file is required");
  });
});

describe("MediaController forwarding", () => {
  const user: AuthUser = {
    userId: "user-1",
    email: "ada@example.com",
    name: "Ada",
    treeId: "tree-2",
    treeName: "Shared Tree",
    role: TreeRole.EDITOR,
  };

  it("forwards upload/get/delete to MediaService", async () => {
    const mediaService = {
      createMedia: jest.fn().mockResolvedValue({ id: "m1" }),
      getMediaForIndividual: jest.fn().mockResolvedValue([]),
      deleteMedia: jest.fn().mockResolvedValue(true),
    };
    const controller = new MediaController(
      mediaService as unknown as MediaService,
    );
    const file = { originalname: "a.jpg" } as Express.Multer.File;

    await controller.uploadMedia(user, file, {
      attachedToId: "indi-1",
      type: "PHOTO",
    } as any);
    await controller.getMedia(user, "indi-1");
    await controller.deleteMedia(user, "m1");

    expect(mediaService.createMedia).toHaveBeenCalledWith(
      "tree-2",
      file,
      expect.objectContaining({ attachedToId: "indi-1" }),
    );
    expect(mediaService.getMediaForIndividual).toHaveBeenCalledWith(
      "tree-2",
      "indi-1",
    );
    expect(mediaService.deleteMedia).toHaveBeenCalledWith("tree-2", "m1");
  });
});
