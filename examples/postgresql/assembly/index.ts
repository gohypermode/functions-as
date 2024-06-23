import { postgresql } from "@hypermode/functions-as";

class Person {
  ID: i64 = 0;
  name!: string;
  age!: i64;
  home!: postgresql.Point;
}

export function queryPeople(): Person[] {
  const resp = postgresql.query<Person>(
    "neon",
    "select name, age, home from people",
  );
  return resp.rows;
}

export function getPerson(name: string): Person | null {
  const query = "select age, home from people where name = $1";

  const params: postgresql.Params = new postgresql.Params();
  params.push(name);

  const people = postgresql.query<Person>("neon", query, params);
  return people.rows[0];
}

export function addPerson(name: string, age: i32, lat: f64, lon: f64): void {
  const query =
    "insert into people (name, age, home) values ($1, $2, $3) RETURNING id";

  const params: postgresql.Params = new postgresql.Params();
  params.push(name);
  params.push(age);
  params.push(new postgresql.Point(lat, lon));

  // TODO
  const people = postgresql.query<Person>("neon", query, params);
  const person = people.rows[0];
}
