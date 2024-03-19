// This file should only export functions from the "hypermode" host module.

export declare function executeDQL(
  statement: string,
  variables: string,
  isMutation: bool,
): string;

export declare function executeGQL(
  statement: string,
  variables: string,
): string;

export declare function invokeClassifier(
  modelId: string,
  sentenceMap: string,
): string;

export declare function computeEmbedding(
  modelId: string,
  sentenceMap: string,
): string;

export declare function invokeTextGenerator(
  modelId: string,
  instruction: string,
  sentence: string,
): string;

export declare function semanticSearch(
  embeddingIndex: string,
  sentence: string,
): string;
