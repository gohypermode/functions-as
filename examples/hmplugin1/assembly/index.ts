import { JSON } from "json-as";
import {
  dql,
  graphql,
  model,
  ClassificationResult,
  QueryParameters,
} from "@hypermode/functions-as";

export function add(a: i32, b: i32): i32 {
  return a + b;
}

export function getFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`;
}

export function getPeople(): Person[] {
  const people = [
    <Person>{ firstName: "Bob", lastName: "Smith" },
    <Person>{ firstName: "Alice", lastName: "Jones" },
  ];

  people.forEach((p) => p.updateFullName());
  return people;
}

export function queryPeople1(): Person[] {
  const query = `
    {
      people(func: type(Person)) {
        id: uid
        firstName: Person.firstName
        lastName: Person.lastName
      }
    }
  `;

  const response = dql.query<PeopleData>(query);
  const people = response.data.people;
  people.forEach((p) => p.updateFullName());
  return people;
}

export function queryPeopleWithVars(
  firstName: string,
  lastName: string,
): Person[] {
  const query = `
    query peopleWithVars($firstName: string, $lastName: string) {
      people(func: eq(Person.firstName, $firstName)) @filter(eq(Person.lastName, $lastName)) {
        id: uid
        firstName: Person.firstName
        lastName: Person.lastName
      }
    }
  `;

  const parameters = new QueryParameters();
  parameters.set("$firstName", firstName);
  parameters.set("$lastName", lastName);

  const response = dql.query<PeopleData>(query, parameters);
  const people = response.data.people;
  people.forEach((p) => p.updateFullName());
  return people;
}

export function queryPeople2(): Person[] {
  const statement = `
    query {
      people: queryPerson {
        id
        firstName
        lastName
        fullName
      }
    }
  `;

  const results = graphql.execute<PeopleData>(statement);

  // completely optional, but let's log some tracing info
  const tracing = results.extensions!.tracing;
  const duration = tracing.duration / 1000000.0;
  console.log(`Start: ${tracing.startTime.toISOString()}`);
  console.log(`End: ${tracing.endTime.toISOString()}`);
  console.log(`Duration: ${duration}ms`);

  return results.data.people;
}

export function newPerson1(firstName: string, lastName: string): string {
  const statement = `
    {
      set {
        _:x <Person.firstName> "${firstName}" .
        _:x <Person.lastName> "${lastName}" .
        _:x <dgraph.type> "Person" .
      }
    }
  `;

  const response = dql.mutate(statement);
  return response.data.uids.get("x");
}

export function newPerson2(firstName: string, lastName: string): string {
  const statement = `
    mutation {
      addPerson(input: [{firstName: "${firstName}", lastName: "${lastName}" }]) {
        people: person {
          id
        }
      }
    }
  `;

  const response = graphql.execute<AddPersonPayload>(statement);
  return response.data.addPerson.people[0].id!;
}

function getPersonCount(): i32 {
  const statement = `
    query {
      aggregatePerson {
        count
      }
    }
  `;

  const response = graphql.execute<AggregatePersonResult>(statement);
  return response.data.aggregatePerson.count;
}

export function getRandomPerson(): Person {
  const count = getPersonCount();
  const offset = <u32>Math.floor(Math.random() * count);
  const statement = `
    query {
      people: queryPerson(first: 1, offset: ${offset}) {
        id
        firstName
        lastName
        fullName
      }
    }
  `;

  const results = graphql.execute<PeopleData>(statement);
  return results.data.people[0];
}

export function testClassifier(
  modelId: string,
  text: string,
): ClassificationResult {
  return model.classifyText(modelId, text);
}

export function testMultipleClassifier(
  modelId: string,
  ids: string,
  texts: string,
): ClassificationObject[] {
  // convert ids to array
  const idArr = JSON.parse<string[]>(ids);
  // convert texts to array
  const textArr = JSON.parse<string[]>(texts);
  const textMap = new Map<string, string>();
  for (let i = 0; i < idArr.length; i++) {
    textMap.set(idArr[i], textArr[i]);
  }
  const response = model.classifyTexts(modelId, textMap);
  const resultObjs: ClassificationObject[] = [];
  for (let i = 0; i < idArr.length; i++) {
    resultObjs.push({
      id: idArr[i],
      text: textArr[i],
      result: response.get(idArr[i]),
    });
  }
  return resultObjs;
}

export function testEmbedding(modelId: string, text: string): f64[] {
  return model.computeTextEmbedding(modelId, text);
}

export function testEmbeddings(
  modelId: string,
  ids: string,
  texts: string,
): EmbeddingObject[] {
  // convert ids to array
  const idArr = JSON.parse<string[]>(ids);
  // convert texts to array
  const textArr = JSON.parse<string[]>(texts);
  const textMap = new Map<string, string>();
  for (let i = 0; i < idArr.length; i++) {
    textMap.set(idArr[i], textArr[i]);
  }
  const response = model.computeTextEmbeddings(modelId, textMap);
  const resultObjs: EmbeddingObject[] = [];
  for (let i = 0; i < idArr.length; i++) {
    resultObjs.push({
      id: idArr[i],
      text: textArr[i],
      embedding: response.get(idArr[i]),
    });
  }
  return resultObjs;
}

export function testTextGenerator(
  modelId: string,
  instruction: string,
  text: string,
): string {
  return model.generateText(modelId, instruction, text);
}


@json
class Person {
  id: string | null = null;
  firstName: string = "";
  lastName: string = "";
  fullName: string | null = null;

  updateFullName(): void {
    this.fullName = `${this.firstName} ${this.lastName}`;
  }
}


@json
class PeopleData {
  people!: Person[];
}


@json
class AddPersonPayload {
  addPerson!: PeopleData;
}


@json
class AggregatePersonResult {
  aggregatePerson!: GQLAggregateValues;
}


@json
class GQLAggregateValues {
  count: u32 = 0;
}

class ClassificationObject {
  id!: string;
  text!: string;
  result!: ClassificationResult;
}

class EmbeddingObject {
  id!: string;
  text!: string;
  embedding!: f64[];
}

export function testError(): void {
  console.log("hello");
  console.log("howdy");
  throw new Error("This is a test error");
}
