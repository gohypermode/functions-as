import binaryen from "assemblyscript/lib/binaryen.js";
import {
  Class,
  ElementKind,
  Function as Func,
  FunctionDeclaration,
  Program,
  Property,
  Type,
} from "assemblyscript/dist/assemblyscript.js";
import {
  FunctionSignature,
  Parameter,
  ProgramInfo,
  TypeDefinition,
  TypeInfo,
  typeMap,
} from "./types.js";
import HypermodeTransform from "./index.js";

export class Extractor {
  binaryen: typeof binaryen;
  module: binaryen.Module;
  program: Program;
  transform: HypermodeTransform;
  funcMetadata: Map<string, FunctionSignature>;

  constructor(transform: HypermodeTransform, module: binaryen.Module) {
    this.program = transform.program;
    this.binaryen = transform.binaryen;
    this.module = module;
    this.funcMetadata = transform.funcMetadata;
  }

  getProgramInfo(): ProgramInfo {
    const functions = this.getExportedFunctions()
      .map((e) => this.convertToFunctionSignature(e))
      .sort((a, b) => a.name.localeCompare(b.name));

    const hostFunctions = this.getHostFunctions()
      .map((e) => this.convertToFunctionSignature(e))
      .sort((a, b) => a.name.localeCompare(b.name));

    const allTypes = new Map<string, TypeDefinition>(
      Array.from(this.program.managedClasses.values())
        .filter((c) => c.id > 2) // skip built-in classes
        .map((c) => {
          const info = getTypeInfo(c.type);
          return new TypeDefinition(
            c.id,
            c.nextMemoryOffset, // size
            info.path,
            info.name,
            this.getClassFields(c),
          );
        })
        .map((t) => [t.path, t]),
    );

    const typePathsUsed = new Set(
      functions
        .concat(hostFunctions)
        .flatMap((f) =>
          f.parameters.map((p) => p.type.path).concat(f.returnType.path),
        ),
    );

    const typesUsed = new Map<string, TypeDefinition>();
    allTypes.forEach((t) => {
      if (typePathsUsed.has(t.path)) {
        typesUsed.set(t.path, t);
      }
    });

    typesUsed.forEach((t) => {
      this.expandDependentTypes(t, allTypes, typesUsed);
    });

    const types = Array.from(typesUsed.values()).sort((a, b) =>
      (a.name + a.path).localeCompare(b.name + b.path),
    );

    return { functions, types };
  }

  private expandDependentTypes(
    type: TypeDefinition,
    allTypes: Map<string, TypeDefinition>,
    typesUsed: Map<string, TypeDefinition>,
  ) {
    // collect dependent types into this set
    const dependentTypes = new Set<TypeDefinition>();

    // include fields
    if (type.fields) {
      type.fields.forEach((f) => {
        let path = f.type.path;
        if (path.endsWith("|null")) {
          path = path.slice(0, -5);
        }
        const typeDef = allTypes.get(path);
        if (typeDef) {
          dependentTypes.add(typeDef);
        }
      });
    }

    // include generic type arguments
    const cls = this.program.managedClasses.get(type.id);
    if (cls.typeArguments) {
      cls.typeArguments.forEach((t) => {
        const typeDef = allTypes.get(t.toString());
        if (typeDef) {
          dependentTypes.add(typeDef);
        }
      });
    }

    // recursively expand dependencies of dependent types
    dependentTypes.forEach((t) => {
      if (!typesUsed.has(t.path)) {
        typesUsed.set(t.path, t);
        this.expandDependentTypes(t, allTypes, typesUsed);
      }
    });
  }

  private getClassFields(c: Class) {
    if (
      c.isArrayLike ||
      typeMap.has(c.type.toString()) ||
      typeMap.has(c.prototype.internalName)
    ) {
      return undefined;
    }

    return Array.from(c.members.values())
      .filter((m) => m.kind === ElementKind.PropertyPrototype)
      .map((m) => {
        const instance = this.program.instancesByName.get(m.internalName);
        return instance as Property;
      })
      .filter((p) => p && p.isField)
      .map((f) => ({
        offset: f.memoryOffset,
        name: f.name,
        type: getTypeInfo(f.type),
      }));
  }

  private getExportedFunctions() {
    const results: importExportInfo[] = [];

    for (let i = 0; i < this.module.getNumExports(); ++i) {
      const ref = this.module.getExportByIndex(i);
      const info = this.binaryen.getExportInfo(ref);

      if (info.kind !== binaryen.ExternalFunction) {
        continue;
      }

      const exportName = info.name;
      if (exportName.startsWith("_")) {
        continue;
      }

      const functionName = info.value.replace(/^export:/, "");
      results.push({ name: exportName, function: functionName });
    }

    return results;
  }

  private getHostFunctions() {
    const results: importExportInfo[] = [];
    const hypermodeImports = this.program.moduleImports.get("hypermode");
    if (hypermodeImports) {
      hypermodeImports.forEach((v, k) => {
        results.push({ name: k, function: v.internalName });
      });
    }
    return results;
  }

  private convertToFunctionSignature(e: importExportInfo): FunctionSignature {
    const f = this.program.instancesByName.get(e.function) as Func;
    const d = f.declaration as FunctionDeclaration;
    if (!this.funcMetadata.has(e.name))
      throw new Error(
        "Tried to retrieve type data for function " +
          e.name +
          ", but could not find any!",
      );
    console.log("Getting: " + e.name);
    const fn = this.funcMetadata.get(e.name);
    const params: Parameter[] = [];
    for (let i = 0; i < f.signature.parameterTypes.length; i++) {
      const _type = f.signature.parameterTypes[i];
      const paramMeta = fn.parameters.find(
        (e) => e.name == d.signature.parameters[i].name.text,
      );
      if (!paramMeta) continue;
      const name = d.signature.parameters[i].name.text;
      const type = getTypeInfo(_type);
      const optional = paramMeta.optional;
      const defaultValue = paramMeta.defaultValue;
      params.push({
        name,
        type,
        optional,
        defaultValue,
      });
    }
    return new FunctionSignature(
      e.name,
      params,
      getTypeInfo(f.signature.returnType),
    );
  }
}

interface importExportInfo {
  name: string;
  function: string;
}

export function getTypeInfo(t: Type): TypeInfo {
  const path = t.toString();

  if (t.isNullableReference) {
    const ti = getTypeInfo(t.nonNullableType);
    return { name: `${ti.name} | null`, path: path.replace(/ /g, "") };
  }

  let name = typeMap.get(path);
  if (name) {
    return { name, path };
  }

  const c = t.classReference;
  if (!c) {
    return { name: path, path };
  }

  switch (c.prototype?.internalName) {
    case "~lib/array/Array": {
      const wrap = c.typeArguments[0].isNullableReference;
      const open = wrap ? "(" : "";
      const close = wrap ? ")" : "";
      name = `${open}${getTypeInfo(c.typeArguments[0]).name}${close}[]`;
      break;
    }
    case "~lib/map/Map": {
      name = `Map<${getTypeInfo(c.typeArguments[0]).name}, ${getTypeInfo(c.typeArguments[1]).name}>`;
      break;
    }
    default:
      name = c.name;
  }

  return { name, path };
}
