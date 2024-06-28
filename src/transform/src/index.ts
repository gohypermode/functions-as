import { Transform } from "assemblyscript/dist/transform.js";
import { createWriteStream } from "fs";
import { HypermodeMetadata } from "./metadata.js";
import { Extractor } from "./extractor.js";
import binaryen from "assemblyscript/lib/binaryen.js";
import {
  ArrayLiteralExpression,
  BlockStatement,
  CommonFlags,
  FunctionDeclaration,
  IdentifierExpression,
  IntegerLiteralExpression,
  LiteralExpression,
  LiteralKind,
  NamedTypeNode,
  NewExpression,
  Node,
  NodeKind,
  ObjectLiteralExpression,
  ParameterKind,
  Parser,
  Range,
  Source,
  SourceKind,
  StringLiteralExpression,
  Token,
  Tokenizer,
} from "assemblyscript/dist/assemblyscript.js";
import { FunctionSignature, Parameter, TypeInfo } from "./types.js";

export default class HypermodeTransform extends Transform {
  public funcMetadata = new Map<string, FunctionSignature>();
  afterParse(parser: Parser) {
    const sources = parser.sources
      .filter((source) => !isStdlib(source))
      .sort((_a, _b) => {
        const a = _a.internalPath;
        const b = _b.internalPath;
        if (a[0] === "~" && b[0] !== "~") {
          return -1;
        } else if (a[0] !== "~" && b[0] === "~") {
          return 1;
        } else {
          return 0;
        }
      });

    for (const source of sources) {
      for (const stmt of source.statements) {
        if (stmt.kind === NodeKind.FunctionDeclaration) {
          const node = stmt as FunctionDeclaration;
          if (
            node.flags === CommonFlags.Export &&
            source.sourceKind === SourceKind.UserEntry
          ) {
            let name = node.name.text;
            if (!node.body && node.decorators?.length) {
              const decorator = node.decorators.find(
                (e) => (e.name as IdentifierExpression).text === "external",
              );
              if (
                decorator.args.length > 1 &&
                decorator.args[1].kind === NodeKind.Literal
              ) {
                name = (
                  decorator.args[1] as StringLiteralExpression
                ).value.toString();
              }
            }
            const params: Parameter[] = [];
            const returnType: TypeInfo = {
              name: (node.signature.returnType as unknown as NamedTypeNode).name
                .identifier.text,
              path: "UNINITIALIZED_VALUE",
            };
            for (const param of node.signature.parameters) {
              let defaultValue = "...";
              if (param.initializer) {
                if (
                  isNumberType(
                    (param.type as unknown as NamedTypeNode).name.identifier
                      .text,
                  )
                ) {
                  defaultValue = (
                    param.initializer as IntegerLiteralExpression
                  ).value.toString();
                  if (defaultValue.length > 15)
                    defaultValue = defaultValue.slice(0, 10) + "...";
                } else if (param.initializer.kind === NodeKind.New) {
                  if (!(param.initializer as NewExpression).args.length) {
                    defaultValue = "{}";
                  } else {
                    defaultValue = "{...}";
                  }
                } else if (
                  param.initializer.kind === NodeKind.Literal &&
                  (param.initializer as LiteralExpression).literalKind ==
                    LiteralKind.Object
                ) {
                  if (
                    !(param.initializer as ObjectLiteralExpression).values
                      .length &&
                    !(param.initializer as ObjectLiteralExpression).names.length
                  ) {
                    defaultValue = "[]";
                  } else {
                    defaultValue = "[...]";
                  }
                } else if (
                  param.initializer.kind === NodeKind.Literal &&
                  (param.initializer as LiteralExpression).literalKind ==
                    LiteralKind.String
                ) {
                  defaultValue =
                    '"' +
                    (param.initializer as StringLiteralExpression).value +
                    '"';
                  if (defaultValue.length > 15)
                    defaultValue = defaultValue.slice(0, 10) + '..."';
                } else if (
                  param.initializer.kind === NodeKind.Literal &&
                  (param.initializer as LiteralExpression).literalKind ==
                    LiteralKind.Array
                ) {
                  if (
                    !(param.initializer as ArrayLiteralExpression)
                      .elementExpressions.length
                  ) {
                    defaultValue = "[]";
                  } else {
                    defaultValue = "[...]";
                  }
                } else if (param.initializer.kind === NodeKind.Null) {
                  defaultValue = "null";
                }
              }
              params.push({
                name: param.name.text,
                type: {
                  name: "UNINITIALIZED_VALUE",
                  path: "UNINITIALIZED_VALUE",
                },
                optional: param.initializer ? true : false,
                defaultValue,
              });
            }
            const meta = new FunctionSignature(name, params, returnType);
            this.funcMetadata.set(name, meta);

            if (
              node.signature.parameters.filter((v) => v.initializer).length >= 2
            ) {
              let body: BlockStatement;
              if (node.body.kind != NodeKind.Block) {
                body = Node.createBlockStatement([node.body], node.range);
              } else {
                body = node.body as BlockStatement;
              }
              node.signature.parameters.push(
                Node.createParameter(
                  ParameterKind.Default,
                  Node.createIdentifierExpression(
                    "__SUPPLIED_PARAMS",
                    node.range,
                    false,
                  ),
                  Node.createNamedType(
                    Node.createSimpleTypeName("u64", node.range),
                    [],
                    false,
                    node.range,
                  ),
                  null,
                  node.range,
                ),
              );
              let first = true;
              for (let i = 1; i < node.signature.parameters.length; i++) {
                const param = node.signature.parameters[i];
                if (!param.initializer) continue;
                const stmt = Node.createIfStatement(
                  Node.createBinaryExpression(
                    Token.Equals_Equals,
                    Node.createParenthesizedExpression(
                      Node.createBinaryExpression(
                        Token.Ampersand,
                        first
                          ? ((first = false),
                            Node.createIdentifierExpression(
                              "__SUPPLIED_PARAMS",
                              node.range,
                            ))
                          : Node.createParenthesizedExpression(
                              Node.createBinaryExpression(
                                Token.GreaterThan_GreaterThan,
                                Node.createIdentifierExpression(
                                  "__SUPPLIED_PARAMS",
                                  node.range,
                                ),
                                newIntegerLiteral(i - 1, node.range),
                                node.range,
                              ),
                              node.range,
                            ),
                        newIntegerLiteral(1, node.range),
                        node.range,
                      ),
                      node.range,
                    ),
                    newIntegerLiteral(0, node.range),
                    node.range,
                  ),
                  Node.createExpressionStatement(
                    Node.createBinaryExpression(
                      Token.Equals,
                      Node.createIdentifierExpression(
                        param.name.text,
                        node.range,
                        false,
                      ),
                      param.initializer,
                      node.range,
                    ),
                  ),
                  null,
                  node.range,
                );
                body.statements.unshift(stmt);
                if (param.initializer) param.initializer = null;
              }
            }
          }
          if (node.body == null) {
            let name = node.name.text;
            if (!node.body && node.decorators?.length) {
              const decorator = node.decorators.find(
                (e) => (e.name as IdentifierExpression).text === "external",
              );
              if (
                decorator.args.length > 1 &&
                decorator.args[1].kind === NodeKind.Literal
              ) {
                name = (
                  decorator.args[1] as StringLiteralExpression
                ).value.toString();
              }
            }
            const params: Parameter[] = [];
            const returnType: TypeInfo = {
              name: (node.signature.returnType as unknown as NamedTypeNode).name
                .identifier.text,
              path: "UNINITIALIZED_VALUE",
            };
            for (const param of node.signature.parameters) {
              let defaultValue = "...";
              if (param.initializer) {
                if (
                  isNumberType(
                    (param.type as unknown as NamedTypeNode).name.identifier
                      .text,
                  )
                ) {
                  defaultValue = (
                    param.initializer as IntegerLiteralExpression
                  ).value.toString();
                  if (defaultValue.length > 15)
                    defaultValue = defaultValue.slice(0, 10) + "...";
                } else if (param.initializer.kind === NodeKind.New) {
                  if (!(param.initializer as NewExpression).args.length) {
                    defaultValue = "{}";
                  } else {
                    defaultValue = "{...}";
                  }
                } else if (
                  param.initializer.kind === NodeKind.Literal &&
                  (param.initializer as LiteralExpression).literalKind ==
                    LiteralKind.Object
                ) {
                  if (
                    !(param.initializer as ObjectLiteralExpression).values
                      .length &&
                    !(param.initializer as ObjectLiteralExpression).names.length
                  ) {
                    defaultValue = "[]";
                  } else {
                    defaultValue = "[...]";
                  }
                } else if (
                  param.initializer.kind === NodeKind.Literal &&
                  (param.initializer as LiteralExpression).literalKind ==
                    LiteralKind.String
                ) {
                  defaultValue =
                    '"' +
                    (param.initializer as StringLiteralExpression).value +
                    '"';
                  if (defaultValue.length > 15)
                    defaultValue = defaultValue.slice(0, 10) + '..."';
                } else if (
                  param.initializer.kind === NodeKind.Literal &&
                  (param.initializer as LiteralExpression).literalKind ==
                    LiteralKind.Array
                ) {
                  if (
                    !(param.initializer as ArrayLiteralExpression)
                      .elementExpressions.length
                  ) {
                    defaultValue = "[]";
                  } else {
                    defaultValue = "[...]";
                  }
                } else if (param.initializer.kind === NodeKind.Null) {
                  defaultValue = "null";
                }
              }
              params.push({
                name: param.name.text,
                type: {
                  name: "UNINITIALIZED_VALUE",
                  path: "UNINITIALIZED_VALUE",
                },
                optional: param.initializer ? true : false,
                defaultValue,
              });
            }
            const meta = new FunctionSignature(name, params, returnType);
            this.funcMetadata.set(name, meta);
          }
        }
      }
    }
  }
  afterCompile(module: binaryen.Module) {
    const extractor = new Extractor(this, module);
    const info = extractor.getProgramInfo();

    const m = HypermodeMetadata.generate();
    m.addFunctions(info.functions);
    m.addTypes(info.types);
    m.writeToModule(module);

    // Write to stdout
    m.logToStream(process.stdout);

    // If running in GitHub Actions, also write to the step summary
    if (process.env.GITHUB_ACTIONS && process.env.GITHUB_STEP_SUMMARY) {
      const stream = createWriteStream(process.env.GITHUB_STEP_SUMMARY, {
        flags: "a",
      });
      m.logToStream(stream, true);
    }
  }
}

const isStdlibRegex =
  /~lib\/(?:array|arraybuffer|atomics|builtins|crypto|console|compat|dataview|date|diagnostics|error|function|iterator|map|math|number|object|process|reference|regexp|set|staticarray|string|symbol|table|typedarray|vector|rt\/?|bindings\/|shared\/typeinfo)|util\/|uri|polyfills|memory/;
function isStdlib(
  s:
    | Source
    | {
        range: Range;
      },
): boolean {
  const source = s instanceof Source ? s : s.range.source;
  return isStdlibRegex.test(source.internalPath);
}

function isNumberType(tp: string): boolean {
  switch (tp) {
    case "u8":
    case "u16":
    case "u32":
    case "u64":
    case "i8":
    case "i16":
    case "i32":
    case "i64":
    case "f32":
    case "f64":
      return true;
    default:
      return false;
  }
}

const parser = new Parser();
function newIntegerLiteral(
  num: number,
  range: Range,
): IntegerLiteralExpression {
  const source = new Source(
    SourceKind.User,
    range.source.normalizedPath,
    num.toString(),
  );
  const tokenizer = new Tokenizer(source);
  parser.currentSource = source;
  const int = parser.parseExpression(tokenizer) as IntegerLiteralExpression;
  int.range = range;
  return int;
}
