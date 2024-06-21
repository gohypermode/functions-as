import { inference, collections } from "@hypermode/functions-as";

// This model name should match one defined in the hypermode.json manifest file.
const modelName: string = "my-custom-embedding";
const myProducts: string = "myProducts";
const searchMethods: string[] = ["searchMethod1", "searchMethod2"];

// This function takes input text and returns the vector embedding for that text.
export function embed(text: string): f64[] {
  return inference.getTextEmbedding(modelName, text);
}

export function upsertProduct(description: string): string {
  const response = collections.upsert(myProducts, null, description);
  if (response.status !== "success") {
    return response.error;
  }
  return response.key;
}

export function deleteProduct(key: string): string {
  const response = collections.remove(myProducts, key);
  if (response.status !== "success") {
    return response.error;
  }
  return response.status;
}

export function getProduct(key: string): string {
  return collections.getText(myProducts, key);
}

export function computeSimilarityBetweenProducts(
  key1: string,
  key2: string,
): f64 {
  return collections.computeSimilarity(myProducts, "searchMethod1", key1, key2)
    .score;
}

export function searchProducts(
  product: string,
): collections.CollectionSearchResult[] {
  const responseArr: collections.CollectionSearchResult[] = [];
  for (let i: i32 = 0; i < searchMethods.length; i++) {
    const response = collections.search(
      myProducts,
      searchMethods[i],
      product,
      10,
      true,
    );
    responseArr.push(response);
  }
  return responseArr;
}

export function recomputeIndexes(): string[] {
  const responseArr: string[] = [];
  for (let i: i32 = 0; i < searchMethods.length; i++) {
    const response = collections.recomputeSearchMethod(
      myProducts,
      searchMethods[i],
    );
    if (response.status !== "success") {
      responseArr.push(response.error);
    }
    responseArr.push(response.status);
  }
  return responseArr;
}
