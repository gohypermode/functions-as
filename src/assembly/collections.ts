import * as utils from "./utils";

export class CollectionMutationResult {
  collection!: string;
  operation!: string;
  status!: string;
  key!: string;
  error!: string;
}

export class SearchMethodMutationResult {
  collection!: string;
  searchMethod!: string;
  operation!: string;
  status!: string;
  error!: string;
}

export class CollectionSearchResult {
  collection!: string;
  searchMethod!: string;
  status!: string;
  objects!: CollectionSearchResultObject[];
  error!: string;
}

export class CollectionSearchResultObject {
  key!: string;
  text!: string;
  score!: f64;
}

// @ts-expect-error: decorator
@external("hypermode", "upsertToCollection")
declare function hostUpsertToCollection(
  collection: string,
  key: string | null,
  text: string,
): CollectionMutationResult;

// @ts-expect-error: decorator
@external("hypermode", "deleteFromCollection")
declare function hostDeleteFromCollection(
  collection: string,
  key: string,
): CollectionMutationResult;

// @ts-expect-error: decorator
@external("hypermode", "searchCollection")
declare function hostSearchCollection(
  collection: string,
  searchMethod: string,
  text: string,
  limit: i32,
  returnText: bool,
): CollectionSearchResult;

// @ts-expect-error: decorator
@external("hypermode", "recomputeSearchMethod")
declare function hostRecomputeSearchMethod(
  collection: string,
  searchMethod: string,
): SearchMethodMutationResult;

// @ts-expect-error: decorator
@external("hypermode", "computeSimilarity")
declare function hostComputeSimilarity(
  collection: string,
  searchMethod: string,
  key1: string,
  key2: string,
): CollectionSearchResultObject;

// @ts-expect-error: decorator
@external("hypermode", "getText")
declare function hostGetText(collection: string, key: string): string;

// @ts-expect-error: decorator
@external("hypermode", "getTexts")
declare function hostGetTexts(collection: string): Map<string, string>;

// add data to in-mem storage, get all embedders for a collection, run text through it
// and insert the Text into the Text indexes for each search method
export function upsert(
  collection: string,
  key: string | null,
  text: string,
): CollectionMutationResult {
  const result = hostUpsertToCollection(collection, key, text);
  if (utils.resultIsInvalid(result)) {
    throw new Error("Error upserting to Text index.");
  }
  return result;
}

// remove data from in-mem storage and indexes
export function remove(
  collection: string,
  key: string,
): CollectionMutationResult {
  const result = hostDeleteFromCollection(collection, key);
  if (utils.resultIsInvalid(result)) {
    throw new Error("Error deleting from Text index.");
  }
  return result;
}

// fetch embedders for collection & search method, run text through it and
// search Text index for similar Texts, return the result keys
// open question: how do i return a more expansive result from string array
export function search(
  collection: string,
  searchMethod: string,
  text: string,
  limit: i32,
  returnText: bool = false,
): CollectionSearchResult {
  const result = hostSearchCollection(
    collection,
    searchMethod,
    text,
    limit,
    returnText,
  );
  if (utils.resultIsInvalid(result)) {
    throw new Error("Error searching Text index.");
  }
  return result;
}

export function recomputeSearchMethod(
  collection: string,
  searchMethod: string,
): SearchMethodMutationResult {
  const result = hostRecomputeSearchMethod(collection, searchMethod);
  if (utils.resultIsInvalid(result)) {
    throw new Error("Error recomputing Text index.");
  }
  return result;
}

export function computeSimilarity(
  collection: string,
  searchMethod: string,
  key1: string,
  key2: string,
): CollectionSearchResultObject {
  return hostComputeSimilarity(collection, searchMethod, key1, key2);
}

export function getText(collection: string, key: string): string {
  return hostGetText(collection, key);
}

export function getTexts(collection: string): Map<string, string> {
  return hostGetTexts(collection);
}