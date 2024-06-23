// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck: decorators are allowed on function exports in AssemblyScript

// This file should only export functions from the "hypermode" host module.

export declare function executeGQL(
  hostName: string,
  statement: string,
  variables: string,
): string;

export declare function invokeClassifier(
  modelName: string,
  sentenceMap: Map<string, string>,
): Map<string, Map<string, f32>>;

export declare function computeEmbedding(
  modelName: string,
  sentenceMap: Map<string, string>,
): Map<string, f64[]>;

export declare function invokeTextGenerator(
  modelName: string,
  instruction: string,
  sentence: string,
  format: string,
): string;

export declare function databaseQuery(
  datasourceName: string,
  datasourceType: string,
  queryData: string, // JSON data, structure depends upon the datasource type
): string;
