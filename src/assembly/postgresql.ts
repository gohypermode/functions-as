import * as host from "./hypermode";
import { JSON } from "json-as";

export namespace postgresql {
  export class Point {
    private X: f64;
    private Y: f64;

    constructor(X: f64, Y: f64) {
      this.X = X;
      this.Y = Y;
    }

    public toString(): string {
      return `(${this.X}, ${this.Y})`;
    }
  }

  export class Params {
    data: string[] = [];

    public push<T>(val: T): void {
      // @ts-ignore
      this.data.push(val.toString());
    }
  }

  export class Response<T> {
    public rows!: T[];
  }

  export function query<T>(
    datasourceName: string,
    query: string,
    params: Params = new Params(),
  ): Response<T> {
    const datasourceType = "postgresql";

    const input: hostInput = {
      query: query,
      params: params.data,
    };

    const respHost = host.databaseQuery(
      datasourceName,
      datasourceType,
      JSON.stringify<hostInput>(input),
    );

    const parsedResp = JSON.parse<hostResponse>(respHost);
    if (parsedResp.error != "") {
      throw new Error(parsedResp.error);
    }

    const resp = new Response<T>();
    resp.rows = JSON.parse<T[]>(parsedResp.result);
    return resp;
  }


  @json
  class hostInput {
    query!: string;
    params!: string[];
  }


  @json
  class hostResponse {
    error!: string;
    result!: string;
  }
}
