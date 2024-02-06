import * as host from "./hypermode";
import { DQLResponse, DQLMutationResponse } from "./dqltypes";
import { GQLResponse } from "./gqltypes";
import { JSON } from "json-as";

const UNCERTAIN_LABEL = "UNCERTAIN";
const UNCERTAIN_PROBABILITY = f32(1.0);

export abstract class dql {
  public static mutate(
    query: string,
    variables: Map<string, string> = new Map<string, string>(),
  ): DQLResponse<DQLMutationResponse> {
    return this.execute<DQLMutationResponse>(true, query, variables);
  }

  public static query<TData>(
    query: string,
    variables: Map<string, string> = new Map<string, string>(),
  ): DQLResponse<TData> {
    return this.execute<TData>(false, query, variables);
  }

  private static execute<TData>(
    isMutation: bool,
    query: string,
    variables: Map<string, string> = new Map<string, string>(),
  ): DQLResponse<TData> {
    const variablesJson = JSON.stringify(variables);
    const response = host.executeDQL(query, variablesJson, isMutation);
    return JSON.parse<DQLResponse<TData>>(response);
  }
}

export abstract class graphql {
  static execute<TData>(
    statement: string,
    variables: Map<string, string> = new Map<string, string>(),
  ): GQLResponse<TData> {
    const variablesJson = JSON.stringify(variables);
    const response = host.executeGQL(statement, variablesJson);
    return JSON.parse<GQLResponse<TData>>(response);
  }
}

export abstract class model {
  public static classifyText(
    modelId: string,
    text: string,
  ): ClassificationResult {
    const textMap = new Map<string, string>();
    textMap.set("text", text);
    const response = host.invokeClassifier(modelId, JSON.stringify(textMap));
    const res = JSON.parse<Map<string, ClassificationResult>>(response);
    return res.get("text");
  }

  public static classifyTexts(
    modelId: string,
    texts: Map<string, string>,
  ): Map<string, ClassificationResult> {
    const response = host.invokeClassifier(modelId, JSON.stringify(texts));
    return JSON.parse<Map<string, ClassificationResult>>(response);
  }

  public static computeTextEmbedding(modelId: string, text: string): string {
    const textMap = new Map<string, string>();
    textMap.set("text", text);
    const response = host.computeEmbedding(modelId, JSON.stringify(textMap));
    const res = JSON.parse<Map<string, string>>(response);
    return res.get("text");
  }

  public static computeTextEmbeddings(
    modelId: string,
    texts: Map<string, string>,
  ): Map<string, string> {
    const response = host.computeEmbedding(modelId, JSON.stringify(texts));
    return JSON.parse<Map<string, string>>(response);
  }
}

export abstract class classifier {
  public static getMaxProbability(
    res: ClassificationResult,
    threshold: f32 = 0.0,
  ): ClassificationProbability | null {
    const probabilities = res.probabilities;
    if (probabilities.length === 0) {
      return null;
    }
    let max = probabilities[0];
    for (let i = 1; i < probabilities.length; i++) {
      if (probabilities[i].probability > max.probability) {
        max = probabilities[i];
      }
    }
    if (max.probability < threshold) {
      return <ClassificationProbability>{
        label: UNCERTAIN_LABEL,
        probability: UNCERTAIN_PROBABILITY,
      };
    }
    return max;
  }

  public static getMinProbability(
    res: ClassificationResult,
    threshold: f32 = 1.0,
  ): ClassificationProbability | null {
    const probabilities = res.probabilities;
    if (probabilities.length === 0) {
      return null;
    }
    let min = probabilities[0];
    for (let i = 1; i < probabilities.length; i++) {
      if (probabilities[i].probability < min.probability) {
        min = probabilities[i];
      }
    }
    if (min.probability > threshold) {
      return <ClassificationProbability>{
        label: UNCERTAIN_LABEL,
        probability: UNCERTAIN_PROBABILITY,
      };
    }
    return min;
  }
}


@json
export class ClassificationProbability {
  // must be defined in the library
  label!: string;
  probability!: f32;
}


@json
export class ClassificationResult {
  // must be defined in the library
  probabilities!: ClassificationProbability[];
}
