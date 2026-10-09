import luaparse from 'luaparse';
import { OBFUSCATION_WATERMARK } from './script-obfuscation-contract.js';

export const FREZEN_VM_V3_PROFILE = Object.freeze({
  version: '3.0',
  mode: 'Frezen Virtual Instruction Runtime',
  strength: 'EXTREME',
  protectionLevel: 99,
  bytecode: false,
  runtimeVm: true,
  sourceCompatible: true,
  sourceMaterialization: false,
  loadstring: false,
  algorithm: 'ast-instruction-virtualization+lazy-constant-pool+per-build-opcode-map+per-build-pool-permutation+per-build-alphabet',
});

export const MAX_VM_V3_SOURCE_BYTES = 2 * 1024 * 1024;
export const FREZEN_VM_V3_LUA_VERSION = '5.1';

const ALPHABET = '0123456789ABCDEFGHJKLMNPQRTUVWXYZ';
const OPS = Object.freeze({
  LOCAL: 1, SET: 2, CALL_STMT: 3, RETURN: 4, IF: 5, WHILE: 6, REPEAT: 7, DO: 8,
  NUMFOR: 9, GENFOR: 10, FUNCDECL: 11, BREAK: 12,
  CONST: 20, VAR: 21, INDEX: 22, CALL: 23, MCALL: 24, BIN: 25, LOGIC: 26,
  UNARY: 27, FUNC: 28, TABLE: 29, VARARG: 30,
});

const BIN_OPS = Object.freeze({
  '+': 1, '-': 2, '*': 3, '/': 4, '%': 5, '^': 6, '..': 7,
  '==': 8, '~=': 9, '<': 10, '<=': 11, '>': 12, '>=': 13, '//': 14,
});
const LOGIC_OPS = Object.freeze({ and: 1, or: 2 });
const UNARY_OPS = Object.freeze({ '-': 1, '#': 2, not: 3 });

const rint = (min = 1000, max = 999999999) =>
  Math.floor(min + Math.random() * (max - min + 1));

function randomName(prefix = '__fvm3') {
  return prefix + rint(100000, 999999999);
}

function shuffle(values) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rint(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function createOpcodeMap() {
  const keys = Object.keys(OPS);
  const values = new Set();
  while (values.size < keys.length) values.add(rint(257, 65535));
  const ids = [...values];
  return Object.freeze(Object.fromEntries(keys.map((key, index) => [key, ids[index]])));
}

function encodeBytes(bytes, alphabet = ALPHABET) {
  const add = rint(7, 247);
  const step = rint(1, 251);
  const out = [];
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    const x = (b + add + ((i * step) % 256)) % 256;
    out.push(alphabet[(x >> 4) & 15], alphabet[x & 15]);
  }
  return { value: out.join(''), add, step, length: bytes.length };
}

function constKey(type, value) {
  return type === 's' ? 's:' + value : type === 'n' ? 'n:' + String(value) : type + ':' + String(value);
}

function memberName(node) {
  const value = node?.identifier ?? node?.index;
  return typeof value === 'object' && value !== null
    ? String(value.name ?? value.value ?? '')
    : String(value ?? '');
}

const COMPOUND_OPERATOR_MAP = Object.freeze({
  "+=": "+",
  "-=": "-",
  "*=": "*",
  "/=": "/",
  "%=": "%",
  "^=": "^",
  "..=": "..",
});

function nextCompoundTemp(source, counter) {
  let n = counter;
  let name;
  do {
    n += 1;
    name = "__frezen_v3_compound_" + n;
  } while (source.includes(name));
  return { name, counter: n };
}

function findMatchingOpenBracket(text, closeIndex) {
  let depth = 0;
  let quote = null;
  for (let i = closeIndex; i >= 0; i -= 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote && text[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === ']') depth += 1;
    else if (ch === '[') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function rewriteCompoundTarget(lhs, operator, rhs, source, counter) {
  const target = lhs.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(target)) {
    const memberMatch = target.match(/^(.*)\.([A-Za-z_][A-Za-z0-9_]*)$/);
    const indexClose = target.endsWith(']') ? target.length - 1 : -1;

    if (memberMatch) {
      const base = memberMatch[1].trim();
      if (!base) return null;
      const temp = nextCompoundTemp(source, counter);
      const key = JSON.stringify(memberMatch[2]);
      const left = temp.name + "[" + key + "]";
      const value = operator === "//="
        ? "math.floor(" + left + " / " + rhs + ")"
        : left + " " + COMPOUND_OPERATOR_MAP[operator] + " " + rhs;
      if (operator !== "//=" && !COMPOUND_OPERATOR_MAP[operator]) return null;
      return {
        counter: temp.counter,
        text: [
          "do",
          "local " + temp.name + " = " + base,
          left + " = " + value,
          "end",
        ].join("\n"),
      };
    }

    if (indexClose >= 0) {
      const open = findMatchingOpenBracket(target, indexClose);
      if (open <= 0) return null;
      const base = target.slice(0, open).trim();
      const key = target.slice(open + 1, indexClose).trim();
      if (!base || !key) return null;

      const tempBase = nextCompoundTemp(source, counter);
      const tempKey = nextCompoundTemp(source, tempBase.counter);
      const left = tempBase.name + "[" + tempKey.name + "]";
      const value = operator === "//="
        ? "math.floor(" + left + " / " + rhs + ")"
        : left + " " + COMPOUND_OPERATOR_MAP[operator] + " " + rhs;
      if (operator !== "//=" && !COMPOUND_OPERATOR_MAP[operator]) return null;
      return {
        counter: tempKey.counter,
        text: [
          "do",
          "local " + tempBase.name + " = " + base,
          "local " + tempKey.name + " = " + key,
          left + " = " + value,
          "end",
        ].join("\n"),
      };
    }

    return null;
  }

  const op = operator === "//=" ? null : COMPOUND_OPERATOR_MAP[operator];
  if (operator === "//=") {
    return {
      counter,
      text: target + " = math.floor(" + target + " / " + rhs + ")",
    };
  }
  return { counter, text: target + " = " + target + " " + op + " " + rhs };
}

function normalizeLuauCompoundAssignments(source) {
  const operators = ["//=", "..=", "+=", "-=", "*=", "/=", "%=", "^="];
  const lines = String(source ?? "").split(/\r?\n/);
  let counter = 0;
  const out = [];

  for (const line of lines) {
    let quote = null;
    let commentAt = -1;
    let operatorAt = -1;
    let operator = null;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quote) {
        if (ch === quote && line[i - 1] !== "\\") quote = null;
        continue;
      }
      if (ch === "'" || ch === '"') {
        quote = ch;
        continue;
      }
      if (ch === '-' && line[i + 1] === '-') {
        commentAt = i;
        break;
      }
      for (const candidate of operators) {
        if (line.startsWith(candidate, i)) {
          operatorAt = i;
          operator = candidate;
          break;
        }
      }
      if (operatorAt >= 0) break;
    }

    if (operatorAt < 0) {
      out.push(line);
      continue;
    }

    const lhs = line.slice(0, operatorAt).trim();
    const rhs = line.slice(operatorAt + operator.length, commentAt >= 0 ? commentAt : line.length).trim();
    const comment = commentAt >= 0 ? line.slice(commentAt) : "";
    if (!lhs || !rhs || /\b(local|return|if|elseif|while|until|for|function|do|repeat|and|or)\b/.test(lhs)) {
      out.push(line);
      continue;
    }

    const rewritten = rewriteCompoundTarget(lhs, operator, rhs, source, counter);
    if (!rewritten) {
      out.push(line);
      continue;
    }
    counter = rewritten.counter;
    out.push(line.slice(0, line.indexOf(lhs)) + rewritten.text + comment);
  }

  return out.join("\n");
}

// Finds Lua long-bracket strings/comments such as [[...]], [=[...]=], [==[...]==].
function readLongBracket(source, start) {
  if (source[start] !== "[") return null;
  let cursor = start + 1;
  while (source[cursor] === "=") cursor += 1;
  if (source[cursor] !== "[") return null;
  const equals = source.slice(start + 1, cursor);
  return {
    contentStart: cursor + 1,
    close: "]" + equals + "]",
  };
}

// luaparse's pseudo-latin1 mode rejects raw code points above U+00FF.
// Replace those characters only inside Lua string literals with collision-free
// ASCII markers, then restore them before constant encoding.
function protectUnicodeStringLiterals(source) {
  const input = String(source ?? "");
  let prefix;
  do {
    prefix = "__FREZEN_UTF8_" + rint(100000, 999999999) + "_";
  } while (input.includes(prefix));

  const markers = new Map();
  const output = [];
  let markerIndex = 0;
  let i = 0;

  function appendStringCharacter(character) {
    if (character.codePointAt(0) > 0xff) {
      const marker = prefix + markerIndex + "__";
      markerIndex += 1;
      markers.set(marker, character);
      output.push(marker);
    } else {
      output.push(character);
    }
  }

  function appendStringBody(end) {
    while (i < end) {
      const character = String.fromCodePoint(input.codePointAt(i));
      appendStringCharacter(character);
      i += character.length;
    }
  }

  while (i < input.length) {
    // Comments are not string literals; skip them so quotes inside comments
    // cannot accidentally change the scanner's state.
    if (input.startsWith("--", i)) {
      const long = readLongBracket(input, i + 2);
      if (long) {
        output.push(input.slice(i, long.contentStart));
        i = long.contentStart;
        const end = input.indexOf(long.close, i);
        if (end < 0) {
          appendStringBody(input.length);
          break;
        }
        appendStringBody(end);
        output.push(long.close);
        i = end + long.close.length;
        continue;
      }

      const end = input.indexOf("\n", i);
      if (end < 0) {
        output.push(input.slice(i));
        break;
      }
      output.push(input.slice(i, end));
      i = end;
      continue;
    }

    const current = input[i];
    if (current === "'" || current === '"') {
      const quote = current;
      output.push(quote);
      i += 1;

      while (i < input.length) {
        if (input[i] === "\\") {
          output.push("\\");
          i += 1;
          if (i < input.length) {
            const escaped = String.fromCodePoint(input.codePointAt(i));
            output.push(escaped);
            i += escaped.length;
          }
          continue;
        }
        if (input[i] === quote) {
          output.push(quote);
          i += 1;
          break;
        }

        const character = String.fromCodePoint(input.codePointAt(i));
        appendStringCharacter(character);
        i += character.length;
      }
      continue;
    }

    if (current === "[") {
      const long = readLongBracket(input, i);
      if (long) {
        output.push(input.slice(i, long.contentStart));
        i = long.contentStart;
        const end = input.indexOf(long.close, i);
        if (end < 0) {
          appendStringBody(input.length);
          break;
        }
        appendStringBody(end);
        output.push(long.close);
        i = end + long.close.length;
        continue;
      }
    }

    const character = String.fromCodePoint(input.codePointAt(i));
    output.push(character);
    i += character.length;
  }

  return { source: output.join(""), markers };
}

class Compiler {
  constructor(opcodes = createOpcodeMap(), alphabet = ALPHABET) {
    this.ops = opcodes;
    this.alphabet = alphabet;
    this.constants = [];
    this.constantMap = new Map();
    this.unicodeMarkers = new Map();
  }

  constant(type, value) {
    const key = constKey(type, value);
    const found = this.constantMap.get(key);
    if (found !== undefined) return found;
    const entry = type === 'b' ? { t: 'b', v: value ? 1 : 0 }
      : type === 'z' ? { t: 'z' }
      : { t: type, ...encodeBytes(Array.from(new TextEncoder().encode(String(value))), this.alphabet) };
    const index = this.constants.length + 1;
    this.constants.push(entry);
    this.constantMap.set(key, index);
    return index;
  }

  string(value) {
    let restored = String(value ?? "");
    for (const [marker, character] of this.unicodeMarkers) {
      restored = restored.split(marker).join(character);
    }
    return this.constant('s', restored);
  }
  number(value) { return this.constant('n', value); }
  boolean(value) { return this.constant('b', value); }
  nil() { return this.constant('z', null); }

  compile(source) {
    let ast;
    try {
      const compoundNormalized = normalizeLuauCompoundAssignments(source);
      const unicodeProtected = protectUnicodeStringLiterals(compoundNormalized);
      this.unicodeMarkers = unicodeProtected.markers;
      ast = luaparse.parse(unicodeProtected.source, { luaVersion: FREZEN_VM_V3_LUA_VERSION, encodingMode: 'pseudo-latin1', comments: false, scope: false, locations: false, ranges: false, wait: false });
    } catch (error) {
      const message = String(error?.message ?? error);
      throw new Error('VM_V3_PARSE_FAILED:' + message.slice(0, 240));
    }
    const program = this.block(ast.body);
    return { program, constants: this.constants, constantRemap: null, opcodes: this.ops, alphabet: this.alphabet };
  }

  expr(node) {
    if (!node) return [this.ops.CONST, this.nil()];
    switch (node.type) {
      case 'Identifier': return [this.ops.VAR, this.string(node.name)];
      case 'NumericLiteral': return [this.ops.CONST, this.number(node.value)];
      case 'StringLiteral': return [this.ops.CONST, this.string(node.value)];
      case 'BooleanLiteral': return [this.ops.CONST, this.boolean(node.value)];
      case 'NilLiteral': return [this.ops.CONST, this.nil()];
      case 'VarargLiteral': return [this.ops.VARARG];
      case 'IndexExpression': return [this.ops.INDEX, this.expr(node.base), this.expr(node.index)];
      case 'MemberExpression': return [this.ops.INDEX, this.expr(node.base), [this.ops.CONST, this.string(memberName(node))]];
      case 'UnaryExpression':
        if (UNARY_OPS[node.operator] === undefined) throw new Error('VM_V3_UNSUPPORTED_UNARY:' + node.operator);
        return [this.ops.UNARY, UNARY_OPS[node.operator], this.expr(node.argument)];
      case 'BinaryExpression':
        if (BIN_OPS[node.operator] === undefined) throw new Error('VM_V3_UNSUPPORTED_BINARY:' + node.operator);
        return [this.ops.BIN, BIN_OPS[node.operator], this.expr(node.left), this.expr(node.right)];
      case 'LogicalExpression':
        if (LOGIC_OPS[node.operator] === undefined) throw new Error('VM_V3_UNSUPPORTED_LOGICAL:' + node.operator);
        return [this.ops.LOGIC, LOGIC_OPS[node.operator], this.expr(node.left), this.expr(node.right)];
      case 'CallExpression': {
        const args = Array.isArray(node.arguments)
          ? node.arguments
          : node.arguments
            ? [node.arguments]
            : [];
        return this.call(node.base, args.map((arg) => this.expr(arg)));
      }
      case 'TableCallExpression': {
        const arg = node.arguments;
        if (!arg) throw new Error('VM_V3_MISSING_TABLE_CALL_ARGUMENT');
        return this.call(node.base, [this.expr(arg)]);
      }
      case 'StringCallExpression':
        return this.call(node.base, [[this.ops.CONST, this.string(node.argument?.value ?? '')]]);
      case 'FunctionExpression':
      case 'FunctionDeclaration':
        return [this.ops.FUNC,
          (node.parameters || []).map((p) => p.type === 'Identifier' ? this.string(p.name) : this.string('...')),
          !!node.isVararg,
          this.block(node.body || []),
        ];
      case 'TableConstructorExpression':
        return [this.ops.TABLE, (node.fields || []).map((field) => {
          if (field.type === 'TableKeyString') return [1, this.string(field.key?.name ?? field.key), this.expr(field.value)];
          if (field.type === 'TableKey') return [2, this.expr(field.key), this.expr(field.value)];
          return [3, this.expr(field.value)];
        })];
      default:
        throw new Error('VM_V3_UNSUPPORTED_EXPRESSION:' + node.type);
    }
  }

  call(base, args) {
    // luaparse represents obj:method(...) as a CallExpression whose base
    // is a MemberExpression with indexer ':'. Add the receiver explicitly.
    if (base?.type === 'MemberExpression' && base.indexer === ':') {
      return [
        this.ops.MCALL,
        this.expr(base.base),
        [this.ops.CONST, this.string(memberName(base))],
        args,
      ];
    }
    return [this.ops.CALL, this.expr(base), args];
  }

  target(node) {
    if (node.type === 'Identifier') return [1, this.string(node.name)];
    if (node.type === 'IndexExpression') return [2, this.expr(node.base), this.expr(node.index)];
    if (node.type === 'MemberExpression') return [2, this.expr(node.base), [this.ops.CONST, this.string(memberName(node))]];
    throw new Error('VM_V3_UNSUPPORTED_TARGET:' + node.type);
  }

  statement(node) {
    switch (node.type) {
      case 'EmptyStatement':
        return null;
      case 'BreakStatement':
        return [this.ops.BREAK];
      case 'LocalStatement':
        return [this.ops.LOCAL, (node.variables || []).map((v) => {
          if (v.type !== 'Identifier') throw new Error('VM_V3_UNSUPPORTED_LOCAL:' + v.type);
          return this.string(v.name);
        }), (node.init || []).map((x) => this.expr(x))];
      case 'AssignmentStatement':
        return [this.ops.SET, (node.variables || []).map((v) => this.target(v)), (node.init || []).map((x) => this.expr(x))];
      case 'CallStatement':
        return [this.ops.CALL_STMT, this.expr(node.expression)];
      case 'ReturnStatement':
        return [this.ops.RETURN, (node.arguments || []).map((x) => this.expr(x))];
      case 'IfStatement':
        return [this.ops.IF,
          (node.clauses || []).map((clause) => [this.expr(clause.condition), this.block(clause.body || [])]),
          this.block(node.elseBody || []),
        ];
      case 'WhileStatement':
        return [this.ops.WHILE, this.expr(node.condition), this.block(node.body || [])];
      case 'RepeatStatement':
        return [this.ops.REPEAT, this.block(node.body || []), this.expr(node.condition)];
      case 'DoStatement':
        return [this.ops.DO, this.block(node.body || [])];
      case 'ForNumericStatement':
        if (node.variable?.type !== 'Identifier') throw new Error('VM_V3_UNSUPPORTED_NUMFOR_VARIABLE');
        return [this.ops.NUMFOR, this.string(node.variable.name), this.expr(node.start), this.expr(node.end), node.step ? this.expr(node.step) : [this.ops.CONST, this.number(1)], this.block(node.body || [])];
      case 'ForGenericStatement':
        return [this.ops.GENFOR,
          (node.variables || []).map((v) => this.string(v.name)),
          (node.iterators || []).map((x) => this.expr(x)),
          this.block(node.body || []),
        ];
      case 'FunctionDeclaration':
        return [this.ops.FUNCDECL,
          !!node.isLocal,
          this.targetFunction(node.identifier),
          (node.parameters || []).map((p) => p.type === 'Identifier' ? this.string(p.name) : this.string('...')),
          !!node.isVararg,
          this.block(node.body || []),
          !!node.isMethod,
        ];
      case 'LabelStatement':
      case 'GotoStatement':
        throw new Error('VM_V3_UNSUPPORTED_STATEMENT:' + node.type);
      default:
        throw new Error('VM_V3_UNSUPPORTED_STATEMENT:' + node.type);
    }
  }

  targetFunction(node) {
    if (node?.type === 'Identifier') return [1, this.string(node.name)];
    if (node?.type === 'MemberExpression') {
      return [2, this.expr(node.base), [this.ops.CONST, this.string(memberName(node))]];
    }
    throw new Error('VM_V3_UNSUPPORTED_FUNCTION_TARGET:' + node?.type);
  }

  block(body) {
    return (body || []).map((node) => this.statement(node)).filter(Boolean);
  }
}

function randomizeConstantPool(program, constants, ops) {
  const order = shuffle(constants.map((_, index) => index));
  const indexMap = new Map(order.map((oldIndex, newIndex) => [oldIndex + 1, newIndex + 1]));
  const remapIndex = (index) => {
    const mapped = indexMap.get(index);
    if (mapped === undefined) throw new Error('VM_V3_CONSTANT_REMAP_FAILED');
    return mapped;
  };
  const remapIndexList = (list) => {
    for (let i = 0; i < (list || []).length; i += 1) list[i] = remapIndex(list[i]);
  };
  const remapExpressionList = (list) => (list || []).forEach(remapExpression);

  function remapTarget(target) {
    if (target[0] === 1) target[1] = remapIndex(target[1]);
    else {
      remapExpression(target[1]);
      remapExpression(target[2]);
    }
  }

  function remapExpression(node) {
    if (!Array.isArray(node)) return;
    const op = node[0];
    if (op === ops.CONST || op === ops.VAR) {
      node[1] = remapIndex(node[1]);
      return;
    }
    if (op === ops.VARARG) return;
    if (op === ops.INDEX) {
      remapExpression(node[1]);
      remapExpression(node[2]);
      return;
    }
    if (op === ops.UNARY) {
      remapExpression(node[2]);
      return;
    }
    if (op === ops.BIN || op === ops.LOGIC) {
      remapExpression(node[2]);
      remapExpression(node[3]);
      return;
    }
    if (op === ops.CALL) {
      remapExpression(node[1]);
      remapExpressionList(node[2]);
      return;
    }
    if (op === ops.MCALL) {
      remapExpression(node[1]);
      remapExpression(node[2]);
      remapExpressionList(node[3]);
      return;
    }
    if (op === ops.FUNC) {
      remapIndexList(node[1]);
      remapBlock(node[3]);
      return;
    }
    if (op === ops.TABLE) {
      for (const field of node[1] || []) {
        if (field[0] === 1) {
          field[1] = remapIndex(field[1]);
          remapExpression(field[2]);
        } else if (field[0] === 2) {
          remapExpression(field[1]);
          remapExpression(field[2]);
        } else if (field[0] === 3) {
          remapExpression(field[1]);
        }
      }
      return;
    }
    throw new Error('VM_V3_CONSTANT_REMAP_EXPRESSION:' + String(op));
  }

  function remapBlock(block) {
    for (const statement of block || []) {
      const op = statement[0];
      if (op === ops.LOCAL) {
        remapIndexList(statement[1]);
        remapExpressionList(statement[2]);
      } else if (op === ops.SET) {
        for (const target of statement[1] || []) remapTarget(target);
        remapExpressionList(statement[2]);
      } else if (op === ops.CALL_STMT) {
        remapExpression(statement[1]);
      } else if (op === ops.RETURN) {
        remapExpressionList(statement[1]);
      } else if (op === ops.IF) {
        for (const clause of statement[1] || []) {
          remapExpression(clause[0]);
          remapBlock(clause[1]);
        }
        remapBlock(statement[2]);
      } else if (op === ops.WHILE) {
        remapExpression(statement[1]);
        remapBlock(statement[2]);
      } else if (op === ops.REPEAT) {
        remapBlock(statement[1]);
        remapExpression(statement[2]);
      } else if (op === ops.DO) {
        remapBlock(statement[1]);
      } else if (op === ops.NUMFOR) {
        statement[1] = remapIndex(statement[1]);
        remapExpression(statement[2]);
        remapExpression(statement[3]);
        remapExpression(statement[4]);
        remapBlock(statement[5]);
      } else if (op === ops.GENFOR) {
        remapIndexList(statement[1]);
        remapExpressionList(statement[2]);
        remapBlock(statement[3]);
      } else if (op === ops.FUNCDECL) {
        remapTarget(statement[2]);
        remapIndexList(statement[3]);
        remapBlock(statement[5]);
      } else if (op !== ops.BREAK) {
        throw new Error('VM_V3_CONSTANT_REMAP_STATEMENT:' + String(op));
      }
    }
    return block;
  }

  remapBlock(program);
  return {
    program,
    constants: order.map((index) => constants[index]),
  };
}


function luaLiteral(value) {
  if (Array.isArray(value)) return `{${value.map(luaLiteral).join(',')}}`;
  if (value === null || value === undefined) return 'nil';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('VM_V3_NONFINITE_NUMBER');
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  throw new Error('VM_V3_UNSUPPORTED_LITERAL:' + typeof value);
}

function runtimeNames() {
  return {
    P: randomName('__p'),
    K: randomName('__k'),
    E: randomName('__e'),
    N: randomName('__n'),
    G: randomName('__g'),
    X: randomName('__x'),
    Y: randomName('__y'),
    Z: randomName('__z'),
    R: randomName('__r'),
    Q: randomName('__q'),
    F: randomName('__f'),
    V: randomName('__v'),
    D: randomName('__d'),
    O: randomName('__o'),
    T: randomName('__t'),
    U: randomName('__u'),
    W: randomName('__w'),
  };
}

export function compileFrezenVmV3(source) {
  const text = String(source ?? '');
  if (!text.trim()) throw new Error('EMPTY_LUA_SOURCE');
  const sourceBytes = new TextEncoder().encode(text).byteLength;
  if (sourceBytes > MAX_VM_V3_SOURCE_BYTES) throw new Error('LUA_SOURCE_TOO_LARGE');

  const c = new Compiler(createOpcodeMap(), shuffle(ALPHABET.split('')).join(''));
  let compiled;
  try {
    compiled = c.compile(text);
  } catch (error) {
    const reason = String(error?.message ?? error);
    throw new Error(reason.startsWith('VM_V3_') ? reason : 'VM_V3_COMPILE_FAILED:' + reason);
  }

  let pool;
  try {
    pool = randomizeConstantPool(compiled.program, compiled.constants, compiled.opcodes);
  } catch (error) {
    const reason = String(error?.message ?? error);
    throw new Error(reason.startsWith('VM_V3_') ? reason : 'VM_V3_CONSTANT_POOL_FAILED:' + reason);
  }
  const program = pool.program;
  const constants = pool.constants;
  const runtimeOps = compiled.opcodes;

  const names = runtimeNames();
  const code = OBFUSCATION_WATERMARK + '\n' + [
    `local ${names.P}={${constants.map((v) => v.t === 'b' ? `{2,${v.v}}` : v.t === 'z' ? '{3}' : `{${v.t === 'n' ? 4 : 1},"${v.value}",${v.add},${v.step},${v.length}}`).join(',')}}`,
    `local ${names.K}=${luaLiteral(program)}`,
    `local ${names.E}={p=nil,v={},h={},a={n=0}}`,
    `local ${names.G}={}`,
    `local ${names.W}; do local ok,env=pcall(function() if type(getfenv)=="function" then return getfenv(1) end return nil end); if not ok or type(env)~="table" then local ok0,env0=pcall(function() if type(getfenv)=="function" then return getfenv(0) end return nil end); if ok0 and type(env0)=="table" then env=env0 end end; if type(env)=="table" then ${names.W}=env else local current=_G["_ENV"]; if type(current)=="table" then ${names.W}=current else ${names.W}=_G end end end`,
    `local ${names.F},${names.T},${names.V},${names.U},${names.O}`,
    `local function ${names.D}(i)`,
    `local e=${names.P}[i]`,
    `if e[1]==2 then return e[2]~=0 end`,
    `if e[1]==3 then return nil end`,
    `local a=e[2]; local add=e[3]; local step=e[4]; local n=e[5]; local out={}`,
    `for j=1,n do local c=string.byte(a,(j-1)*2+1); local d=string.byte(a,(j-1)*2+2); local x=0`,
    `local function dg(z) for q=1,#${JSON.stringify(compiled.alphabet)} do if string.byte(${JSON.stringify(compiled.alphabet)},q)==z then return q-1 end end error("FREZEN_VM_V3_CONST") end`,
    `x=dg(c)*16+dg(d); x=(x-add-(((j-1)*step)%256))%256; out[#out+1]=string.char(x) end`,
    `local text=table.concat(out); if e[1]==4 then return tonumber(text) end return text`,
    `end`,
    `local function ${names.X}(e,n)`,
    `local q=e; while q do if q.h[n] then return q end q=q.p end return nil`,
    `end`,
    `local function ${names.Y}(e,n)`,
    `local q=e; while q do if q.h[n] then return q.v[n] end q=q.p end`,
    `local v=${names.W}[n]; if v~=nil then return v end local ge=_G["_ENV"]; if type(ge)=="table" then v=ge[n]; if v~=nil then return v end end local z=_G[n]; if z~=nil then return z end return nil`,
    `end`,
    `local function ${names.Z}(e,n,v) local q=${names.X}(e,n); if q then q.v[n]=v; return end ${names.W}[n]=v end`,
    `local function ${names.R}(...)`,
    `local t={n=select("#",...)}; for i=1,t.n do t[i]=select(i,...) end return t`,
    `end`,
    `local function ${names.Q}(t,i) return t[i] end`,
    `${names.F}=function(f,args)`,
    `if type(f)=="table" and f.__frezen_v3 then`,
    `local e={p=f.e,v={},h={},a={n=0}}`,
    `for i=1,#f.p do local n=${names.D}(f.p[i]); e.h[n]=true; e.v[n]=args[i] end`,
    `local argc=args.n or #args; if f.va then local a={n=math.max(0,argc-#f.p)}; for i=#f.p+1,argc do a[i-#f.p]=args[i] end e.a=a end`,
    `local r=${names.O}(f.b,e); if r and r.k==1 then local count=r.v.n or #r.v; local out={n=count}; for i=1,count do out[i]=r.v[i] end return out end return {n=0}`,
    `end`,
    `if f==nil then error("FREZEN_VM_V3_CALL_NONFUNCTION:nil") end`,
    `local unpacker=table.unpack or unpack; local packed=${names.R}(pcall(function() return f(unpacker(args,1,args.n or #args)) end)); if not packed[1] then error("FREZEN_VM_V3_CALL_NONFUNCTION:"..type(f)..":"..tostring(packed[2])) end; local out={n=packed.n-1}; for i=1,out.n do out[i]=packed[i+1] end; return out`,
    `if not ok then error("FREZEN_VM_V3_CALL_NONFUNCTION:"..type(f)..":"..tostring(a)) end return {n=10,[1]=a,[2]=b,[3]=c,[4]=d,[5]=e2,[6]=f2,[7]=g2,[8]=h2,[9]=i2,[10]=j2}`,
    `end`,
    `${names.T}=function(e,x,multi)`,
    `if x[1]==${runtimeOps.CONST} then return ${names.D}(x[2]) end`,
    `if x[1]==${runtimeOps.VAR} then return ${names.Y}(e,${names.D}(x[2])) end`,
    `if x[1]==${runtimeOps.VARARG} then local unpacker=table.unpack or unpack; local r=${names.R}(unpacker(e.a,1,e.a.n or 0)); if multi then r.__frezen_multi=true; return r end return r[1] end`,
    `if x[1]==${runtimeOps.INDEX} then local b=${names.T}(e,x[2],false); local k=${names.T}(e,x[3],false); return b[k] end`,
    `if x[1]==${runtimeOps.UNARY} then local a=${names.T}(e,x[3],false); if x[2]==1 then return -a elseif x[2]==2 then return #a elseif x[2]==3 then return not a end end`,
    `if x[1]==${runtimeOps.BIN} then local a=${names.T}(e,x[3],false); local b=${names.T}(e,x[4],false); local o=x[2]; if o==1 then return a+b elseif o==2 then return a-b elseif o==3 then return a*b elseif o==4 then return a/b elseif o==5 then return a%b elseif o==6 then return a^b elseif o==7 then return a..b elseif o==8 then return a==b elseif o==9 then return a~=b elseif o==10 then return a<b elseif o==11 then return a<=b elseif o==12 then return a>b elseif o==13 then return a>=b elseif o==14 then return math.floor(a/b) end end`,
    `if x[1]==${runtimeOps.LOGIC} then local a=${names.T}(e,x[3],false); if x[2]==1 then return a and ${names.T}(e,x[4],false) or a end return a or ${names.T}(e,x[4],false) end`,
    `if x[1]==${runtimeOps.CALL} then local f=${names.T}(e,x[2],false); local a={n=0}; for i=1,#x[3] do local r=${names.T}(e,x[3][i],i==#x[3]); if i==#x[3] and type(r)==\"table\" and r.__frezen_multi then for j=1,r.n do a.n=a.n+1; a[a.n]=r[j] end else a.n=a.n+1; a[a.n]=r end end; local r=${names.F}(f,a); if multi then r.__frezen_multi=true; return r end return r[1] end`,
    `if x[1]==${runtimeOps.MCALL} then local b=${names.T}(e,x[2],false); local k=${names.T}(e,x[3],false); local f=b[k]; local a={n=1,[1]=b}; for i=1,#x[4] do local r=${names.T}(e,x[4][i],i==#x[4]); if i==#x[4] and type(r)==\"table\" and r.__frezen_multi then for j=1,r.n do a.n=a.n+1; a[a.n]=r[j] end else a.n=a.n+1; a[a.n]=r end end; local r=${names.F}(f,a); if multi then r.__frezen_multi=true; return r end return r[1] end`,
    `if x[1]==${runtimeOps.FUNC} then return {__frezen_v3=true,p=x[2],va=x[3],b=x[4],e=e} end`,
    `if x[1]==${runtimeOps.TABLE} then local t={}; for i=1,#x[2] do local f=x[2][i]; if f[1]==1 then t[${names.D}(f[2])]=${names.T}(e,f[3]) elseif f[1]==2 then t[${names.T}(e,f[2])]=${names.T}(e,f[3]) else t[#t+1]=${names.T}(e,f[2]) end end return t end`,
    `error("FREZEN_VM_V3_BAD_EXPR")`,
    `end`,
    `${names.V}=function(e,l,expand)`,
    `local out={n=0}; local n=#l; for i=1,n do local r=${names.T}(e,l[i],i==n and expand); if i==n and expand and type(r)=="table" and r.__frezen_multi then for j=1,r.n do out.n=out.n+1; out[out.n]=r[j] end else out.n=out.n+1; out[out.n]=r end end; return out`,
    `end`,
    `${names.U}=function(e,t)`,
    `if t[1]==1 then return {k=1,e=e,n=${names.D}(t[2])} end local b=${names.T}(e,t[2]); local k=${names.T}(e,t[3]); return {k=2,b=b,n=k}`,
    `end`,
    `${names.O}=function(b,e)`,
    `for pc=1,#b do local s=b[pc]; local op=s[1]`,
    `if op==${runtimeOps.LOCAL} then local rhs=${names.V}(e,s[3],#s[2]>1); for i=1,#s[2] do local n=${names.D}(s[2][i]); e.h[n]=true; e.v[n]=rhs[i] end`,
    `elseif op==${runtimeOps.SET} then local rhs=${names.V}(e,s[3],#s[2]>1); local targets={}; for i=1,#s[2] do targets[i]=${names.U}(e,s[2][i]) end; for i=1,#targets do local t=targets[i]; local v=rhs[i]; if t.k==1 then ${names.Z}(e,t.n,v) else t.b[t.n]=v end end`,
    `elseif op==${runtimeOps.CALL_STMT} then ${names.T}(e,s[2])`,
    `elseif op==${runtimeOps.RETURN} then return {k=1,v=${names.V}(e,s[2],true)}`,
    `elseif op==${runtimeOps.BREAK} then return {k=2}`,
    `elseif op==${runtimeOps.DO} then local r=${names.O}(s[2],{p=e,v={},h={},a={n=0}}); if r then if r.k==1 or r.k==2 then return r end end`,
    `elseif op==${runtimeOps.IF} then local done=false; for i=1,#s[2] do if ${names.T}(e,s[2][i][1]) then local r=${names.O}(s[2][i][2],{p=e,v={},h={},a={}}); if r then return r end; done=true; break end end; if not done and #s[3]>0 then local r=${names.O}(s[3],{p=e,v={},h={},a={}}); if r then return r end end`,
    `elseif op==${runtimeOps.WHILE} then while ${names.T}(e,s[2]) do local r=${names.O}(s[3],{p=e,v={},h={},a={}}); if r and r.k==1 then return r elseif r and r.k==2 then break end end`,
    `elseif op==${runtimeOps.REPEAT} then repeat local r=${names.O}(s[2],{p=e,v={},h={},a={}}); if r and r.k==1 then return r elseif r and r.k==2 then break end until ${names.T}(e,s[3])`,
    `elseif op==${runtimeOps.NUMFOR} then local a=${names.T}(e,s[3]); local z=${names.T}(e,s[4]); local st=${names.T}(e,s[5]); local q=a; while (st>=0 and q<=z) or (st<0 and q>=z) do local le={p=e,v={},h={},a={n=0}}; local n=${names.D}(s[2]); le.h[n]=true; le.v[n]=q; local r=${names.O}(s[6],le); if r and r.k==1 then return r elseif r and r.k==2 then break end; q=q+st end`,
    `elseif op==${runtimeOps.GENFOR} then local it=${names.V}(e,s[3],true); local f=it[1]; local state=it[2]; local ctrl=it[3]; while true do local args={n=2,[1]=state,[2]=ctrl}; local rr=${names.F}(f,args); if rr[1]==nil then break end; ctrl=rr[1]; local le={p=e,v={},h={},a={}}; for i=1,#s[2] do local n=${names.D}(s[2][i]); le.h[n]=true; le.v[n]=rr[i] end; local r=${names.O}(s[4],le); if r and r.k==1 then return r elseif r and r.k==2 then break end end`,
    `elseif op==${runtimeOps.FUNCDECL} then local f={__frezen_v3=true,p=s[4],va=s[5],b=s[6],e=e}; local target=s[3]; if target[1]==1 then local n=${names.D}(target[2]); if s[2] then e.h[n]=true end; ${names.Z}(e,n,f) else local b=${names.T}(e,target[2]); local k=${names.T}(e,target[3]); b[k]=f end`,
    `end end return nil`,
    `end`,
    `do local r=${names.O}(${names.K},${names.E}); if r and r.k==1 then local unpacker=table.unpack or unpack; return unpacker(r.v,1,r.v.n or #r.v) end end`,
  ].join('\n');

  const outputBytes = new TextEncoder().encode(code).byteLength;
  if (outputBytes > MAX_VM_V3_SOURCE_BYTES) throw new Error('OBFUSCATED_LUA_TOO_LARGE');

  return {
    code,
    profile: FREZEN_VM_V3_PROFILE,
    sourceBytes,
    outputBytes,
    instructionCount: JSON.stringify(program).length,
    transforms: {
      strings: 'lazy-constant-pool+per-build-substitution-alphabet',
      constantPool: 'per-build-shuffled-index-map',
      controlFlow: 'instruction-virtualization',
      runtimeSource: 'no-original-source',
      loader: 'none',
      integrity: 'instruction-and-constant-pool',
    },
  };
}

export function isFrezenVmV3(value) {
  const text = String(value ?? '');
  return text.startsWith(OBFUSCATION_WATERMARK)
    && !/loadstring\s*\(?/.test(text)
    && text.includes('FREZEN_VM_V3_BAD_EXPR')
    && text.includes('__frezen_v3');
}
