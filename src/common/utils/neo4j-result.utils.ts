import { Record, Node, Relationship, int } from "neo4j-driver";
import { isObject, isArray } from "lodash";

export class Neo4jResultUtils {
  /**
   * Normalizes Neo4j query results to plain JavaScript objects
   * @param result Neo4j result record or array of records
   * @param returnType Optional type specification ('node'|'relationship'|'value')
   * @returns Normalized JavaScript object or array of objects
   */
  static normalizeNeo4jResult<T = any>(
    result: Record | Record[] | null | undefined,
    returnType?: "node" | "relationship" | "value"
  ): T | T[] | null {
    if (!result) return null;

    if (isArray(result)) {
      return result.map((record) =>
        this.normalizeRecord(record, returnType)
      ) as T[];
    }

    return this.normalizeRecord(result as Record, returnType) as T;
  }

  /**
   * Normalizes a single Neo4j record
   * @param record Neo4j record
   * @param returnType Optional type specification
   * @returns Normalized JavaScript object
   */
  static normalizeRecord(
    record: Record,
    returnType?: "node" | "relationship" | "value"
  ): any {
    if (!record) return null;

    // Handle single value return
    if (record.length === 1) {
      const value = record.get(0);
      return returnType
        ? this.normalizeValue(value, returnType)
        : this.normalizeValue(value);
    }

    // Handle object with multiple fields
    const normalized: any = {};
    record.keys.forEach((key) => {
      normalized[key] = this.normalizeValue(record.get(key));
    });
    return normalized;
  }

  /**
   * Normalizes a single Neo4j value
   * @param value Value to normalize
   * @param typeHint Optional type hint
   * @returns Normalized JavaScript value
   */
  static normalizeValue(
    value: any,
    typeHint?: "node" | "relationship" | "value"
  ): any {
    if (value === null || value === undefined) {
      return null;
    }

    // Handle Neo4j nodes
    if (typeHint === "node" || this.isNeo4jNode(value)) {
      return this.normalizeNode(value);
    }

    // Handle Neo4j relationships
    if (typeHint === "relationship" || this.isNeo4jRelationship(value)) {
      return this.normalizeRelationship(value);
    }

    // Handle Neo4j integers
    if (Number.isInteger(value)) {
      return value.toNumber();
    }

    // Handle arrays
    if (isArray(value)) {
      return value.map((v) => this.normalizeValue(v));
    }

    // Handle objects (but not Nodes/Relationships)
    if (
      isObject(value) &&
      !this.isNeo4jNode(value) &&
      !this.isNeo4jRelationship(value)
    ) {
      const normalized: any = {};
      for (const key in value) {
        normalized[key] = this.normalizeValue((value as any)[key]);
      }
      return normalized;
    }

    // Return primitive values as-is
    return value;
  }

  /**
   * Normalizes a Neo4j Node to a plain JavaScript object
   * @param node Neo4j Node object
   * @returns Normalized node
   */
  private static normalizeNode(node: Node): any {
    if (!node) return null;

    const normalized: any = {
      _id: this.normalizeValue(node.identity),
      _labels: node.labels,
      ...this.normalizeProperties(node.properties as any),
    };

    return normalized;
  }

  /**
   * Normalizes a Neo4j Relationship to a plain JavaScript object
   * @param relationship Neo4j Relationship object
   * @returns Normalized relationship
   */
  private static normalizeRelationship(relationship: Relationship): any {
    if (!relationship) return null;

    const normalized: any = {
      _id: this.normalizeValue(relationship.identity),
      _type: relationship.type,
      _startId: this.normalizeValue(relationship.start),
      _endId: this.normalizeValue(relationship.end),
      ...this.normalizeProperties(relationship.properties as any),
    };

    return normalized;
  }

  /**
   * Normalizes Neo4j properties object
   * @param properties Neo4j properties
   * @returns Normalized properties
   */
  private static normalizeProperties(properties: any): any {
    if (!properties) return {};

    const normalized: any = {};
    for (const key in properties) {
      normalized[key] = this.normalizeValue(properties[key]);
    }
    return normalized;
  }

  /**
   * Checks if a value is a Neo4j Node
   * @param value Value to check
   * @returns true if value is a Neo4j Node
   */
  private static isNeo4jNode(value: any): boolean {
    return (
      isObject(value) &&
      "identity" in value &&
      "labels" in value &&
      "properties" in value
    );
  }

  /**
   * Checks if a value is a Neo4j Relationship
   * @param value Value to check
   * @returns true if value is a Neo4j Relationship
   */
  private static isNeo4jRelationship(value: any): boolean {
    return (
      isObject(value) &&
      "identity" in value &&
      "type" in value &&
      "start" in value &&
      "end" in value &&
      "properties" in value
    );
  }

  /**
   * Extracts the first result from a Neo4j query result
   * @param result Neo4j result
   * @returns First record or null
   */
  static getFirstResult<T = any>(result: Record[]): T | null {
    if (!result || result.length === 0) return null;
    return this.normalizeNeo4jResult(result[0]) as T;
  }

  /**
   * Extracts and normalizes a single field from the first result
   * @param result Neo4j result
   * @param fieldName Field name to extract
   * @returns Field value or null
   */
  static getFirstField<T = any>(result: Record[], fieldName: string): T | null {
    const firstResult = this.getFirstResult(result);
    return firstResult ? firstResult[fieldName] : null;
  }
}
