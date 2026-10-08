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
  algorithm: 'ast-instruction-virtualization+lazy-constant-pool',
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

function encodeBytes(bytes) {
  const add = rint(7, 247);
  const step = rint(1, 251);
  const out = [];
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    const x = (b + add + ((i * step) % 256)) % 256;
    out.push(ALPHABET[(x >> 4) & 15], ALPHABET[x & 15]);
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

class Compiler {
  constructor() {
    this.constants = [];
    this.constantMap = new Map();
  }

  constant(type, value) {
    const key = constKey(type, value);
    const found = this.constantMap.get(key);
    if (found !== undefined) return found;
    const entry = type === 'b' ? { t: 'b', v: value ? 1 : 0 }
      : type === 'z' ? { t: 'z' }
      : { t: type, ...encodeBytes(Array.from(new TextEncoder().encode(String(value)))) };
    const index = this.constants.length + 1;
    this.constants.push(entry);
    this.constantMap.set(key, index);
    return index;
  }

  string(value) { return this.constant('s', value); }
  number(value) { return this.constant('n', value); }
  boolean(value) { return this.constant('b', value); }
  nil() { return this.constant('z', null); }

  compile(source) {
    let ast;
    try {
      const parserSource = normalizeLuauCompoundAssignments(source);
      ast = luaparse.parse(parserSource, { luaVersion: FREZEN_VM_V3_LUA_VERSION, comments: false, scope: false, locations: false, ranges: false, wait: false });
    } catch (error) {
      const message = String(error?.message ?? error);
      throw new Error('VM_V3_PARSE_FAILED:' + message.slice(0, 240));
    }
    const program = this.block(ast.body);
    return { program, constants: this.constants, constantRemap: null };
  }

  expr(node) {
    if (!node) return [OPS.CONST, this.nil()];
    switch (node.type) {
      case 'Identifier': return [OPS.VAR, this.string(node.name)];
      case 'NumericLiteral': return [OPS.CONST, this.number(node.value)];
      case 'StringLiteral': return [OPS.CONST, this.string(node.value)];
      case 'BooleanLiteral': return [OPS.CONST, this.boolean(node.value)];
      case 'NilLiteral': return [OPS.CONST, this.nil()];
      case 'VarargLiteral': return [OPS.VARARG];
      case 'IndexExpression': return [OPS.INDEX, this.expr(node.base), this.expr(node.index)];
      case 'MemberExpression': return [OPS.INDEX, this.expr(node.base), [OPS.CONST, this.string(memberName(node))]];
      case 'UnaryExpression':
        if (UNARY_OPS[node.operator] === undefined) throw new Error('VM_V3_UNSUPPORTED_UNARY:' + node.operator);
        return [OPS.UNARY, UNARY_OPS[node.operator], this.expr(node.argument)];
      case 'BinaryExpression':
        if (BIN_OPS[node.operator] === undefined) throw new Error('VM_V3_UNSUPPORTED_BINARY:' + node.operator);
        return [OPS.BIN, BIN_OPS[node.operator], this.expr(node.left), this.expr(node.right)];
      case 'LogicalExpression':
        if (LOGIC_OPS[node.operator] === undefined) throw new Error('VM_V3_UNSUPPORTED_LOGICAL:' + node.operator);
        return [OPS.LOGIC, LOGIC_OPS[node.operator], this.expr(node.left), this.expr(node.right)];
      case 'CallExpression': {
        const args = Array.isArray(node.arguments)
          ? node.arguments
          : node.arguments
            ? [node.arguments]
            : [];
        if (node.isMethod) {
          const base = node.base?.type === 'MemberExpression' ? node.base.base : node.base;
          const key = node.base?.type === 'MemberExpression'
            ? [OPS.CONST, this.string(memberName(node.base))]
            : [OPS.CONST, this.nil()];
          return [OPS.MCALL, this.expr(base), key, args.map((arg) => this.expr(arg))];
        }
        return [OPS.CALL, this.expr(node.base), args.map((arg) => this.expr(arg))];
      }
      case 'TableCallExpression': {
        const arg = node.arguments;
        if (!arg) throw new Error('VM_V3_MISSING_TABLE_CALL_ARGUMENT');
        return [OPS.CALL, this.expr(node.base), [this.expr(arg)]];
      }
      case 'StringCallExpression':
        return [OPS.CALL, this.expr(node.expression), [[OPS.CONST, this.string(node.argument?.value ?? node.argument?.raw ?? '')]]];
      case 'FunctionExpression':
      case 'FunctionDeclaration':
        return [OPS.FUNC,
          (node.parameters || []).map((p) => p.type === 'Identifier' ? this.string(p.name) : this.string('...')),
          !!node.isVararg,
          this.block(node.body || []),
        ];
      case 'TableConstructorExpression':
        return [OPS.TABLE, (node.fields || []).map((field) => {
          if (field.type === 'TableKeyString') return [1, this.string(field.key?.name ?? field.key), this.expr(field.value)];
          if (field.type === 'TableKey') return [2, this.expr(field.key), this.expr(field.value)];
          return [3, this.expr(field.value)];
        })];
      default:
        throw new Error('VM_V3_UNSUPPORTED_EXPRESSION:' + node.type);
    }
  }

  target(node) {
    if (node.type === 'Identifier') return [1, this.string(node.name)];
    if (node.type === 'IndexExpression') return [2, this.expr(node.base), this.expr(node.index)];
    if (node.type === 'MemberExpression') return [2, this.expr(node.base), [OPS.CONST, this.string(memberName(node))]];
    throw new Error('VM_V3_UNSUPPORTED_TARGET:' + node.type);
  }

  statement(node) {
    switch (node.type) {
      case 'EmptyStatement':
        return null;
      case 'BreakStatement':
        return [OPS.BREAK];
      case 'LocalStatement':
        return [OPS.LOCAL, (node.variables || []).map((v) => {
          if (v.type !== 'Identifier') throw new Error('VM_V3_UNSUPPORTED_LOCAL:' + v.type);
          return this.string(v.name);
        }), (node.init || []).map((x) => this.expr(x))];
      case 'AssignmentStatement':
        return [OPS.SET, (node.variables || []).map((v) => this.target(v)), (node.init || []).map((x) => this.expr(x))];
      case 'CallStatement':
        return [OPS.CALL_STMT, this.expr(node.expression)];
      case 'ReturnStatement':
        return [OPS.RETURN, (node.arguments || []).map((x) => this.expr(x))];
      case 'IfStatement':
        return [OPS.IF,
          (node.clauses || []).map((clause) => [this.expr(clause.condition), this.block(clause.body || [])]),
          this.block(node.elseBody || []),
        ];
      case 'WhileStatement':
        return [OPS.WHILE, this.expr(node.condition), this.block(node.body || [])];
      case 'RepeatStatement':
        return [OPS.REPEAT, this.block(node.body || []), this.expr(node.condition)];
      case 'DoStatement':
        return [OPS.DO, this.block(node.body || [])];
      case 'ForNumericStatement':
        if (node.variable?.type !== 'Identifier') throw new Error('VM_V3_UNSUPPORTED_NUMFOR_VARIABLE');
        return [OPS.NUMFOR, this.string(node.variable.name), this.expr(node.start), this.expr(node.end), node.step ? this.expr(node.step) : [OPS.CONST, this.number(1)], this.block(node.body || [])];
      case 'ForGenericStatement':
        return [OPS.GENFOR,
          (node.variables || []).map((v) => this.string(v.name)),
          (node.iterators || []).map((x) => this.expr(x)),
          this.block(node.body || []),
        ];
      case 'FunctionDeclaration':
        return [OPS.FUNCDECL,
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
      return [2, this.expr(node.base), [OPS.CONST, this.string(memberName(node))]];
    }
    throw new Error('VM_V3_UNSUPPORTED_FUNCTION_TARGET:' + node?.type);
  }

  block(body) {
    return (body || []).map((node) => this.statement(node)).filter(Boolean);
  }
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
  };
}

export function compileFrezenVmV3(source) {
  const text = String(source ?? '');
  if (!text.trim()) throw new Error('EMPTY_LUA_SOURCE');
  const sourceBytes = new TextEncoder().encode(text).byteLength;
  if (sourceBytes > MAX_VM_V3_SOURCE_BYTES) throw new Error('LUA_SOURCE_TOO_LARGE');

  const c = new Compiler();
  let compiled;
  try {
    compiled = c.compile(text);
  } catch (error) {
    const reason = String(error?.message ?? error);
    throw new Error(reason.startsWith('VM_V3_') ? reason : 'VM_V3_COMPILE_FAILED:' + reason);
  }

  const program = compiled.program;
  const constants = compiled.constants;

  const names = runtimeNames();
  const code = OBFUSCATION_WATERMARK + '\n' + [
    `local ${names.P}={${constants.map((v) => v.t === 'b' ? `{2,${v.v}}` : v.t === 'z' ? '{3}' : `{${v.t === 'n' ? 4 : 1},"${v.value}",${v.add},${v.step},${v.length}}`).join(',')}}`,
    `local ${names.K}=${luaLiteral(program)}`,
    `local ${names.E}={p=nil,v={},h={},a={n=0}}`,
    `local ${names.G}={}`,
    `local ${names.F},${names.T},${names.V},${names.U},${names.O}`,
    `local function ${names.D}(i)`,
    `local e=${names.P}[i]`,
    `if e[1]==2 then return e[2]~=0 end`,
    `if e[1]==3 then return nil end`,
    `local a=e[2]; local add=e[3]; local step=e[4]; local n=e[5]; local out={}`,
    `for j=1,n do local c=string.byte(a,(j-1)*2+1); local d=string.byte(a,(j-1)*2+2); local x=0`,
    `local function dg(z) for q=1,#${JSON.stringify(ALPHABET)} do if string.byte(${JSON.stringify(ALPHABET)},q)==z then return q-1 end end error("FREZEN_VM_V3_CONST") end`,
    `x=dg(c)*16+dg(d); x=(x-add-(((j-1)*step)%256))%256; out[#out+1]=string.char(x) end`,
    `local text=table.concat(out); if e[1]==4 then return tonumber(text) end return text`,
    `end`,
    `local function ${names.X}(e,n)`,
    `local q=e; while q do if q.h[n] then return q end q=q.p end return nil`,
    `end`,
    `local function ${names.Y}(e,n)`,
    `local q=e; while q do if q.h[n] then return q.v[n] end q=q.p end`,
    `local ge=rawget(_G,"_ENV"); local g=type(ge)=="table" and rawget(ge,n) or nil; if g~=nil then return g end local z=rawget(_G,n); if z~=nil then return z end local gf=rawget(_G,"getfenv"); if type(gf)=="function" then local ok,env=pcall(gf,0); if ok and type(env)=="table" then local v=rawget(env,n); if v~=nil then return v end end end return nil`,
    `end`,
    `local function ${names.Z}(e,n,v) local q=${names.X}(e,n); if q then q.v[n]=v; return end local ge=rawget(_G,"_ENV"); if type(ge)=="table" then rawset(ge,n,v) else rawset(_G,n,v) end end`,
    `local function ${names.R}(...)`,
    `local t={n=select("#",...)}; for i=1,t.n do t[i]=select(i,...) end return t`,
    `end`,
    `local function ${names.Q}(t,i) return t[i] end`,
    `${names.F}=function(f,args)`,
    `if type(f)=="table" and f.__frezen_v3 then`,
    `local e={p=f.e,v={},h={},a={n=0}}`,
    `for i=1,#f.p do local n=${names.D}(f.p[i]); e.h[n]=true; e.v[n]=args[i] end`,
    `if f.va then local a={n=math.max(0,#args-#f.p)}; for i=#f.p+1,#args do a[i-#f.p]=args[i] end e.a=a end`,
    `local r=${names.O}(f.b,e); if r and r.k==1 then local out={n=#r.v}; for i=1,#r.v do out[i]=r.v[i] end return out end return {n=0}`,
    `end`,
    `if f==nil then error("FREZEN_VM_V3_CALL_NONFUNCTION:nil") end`,
    `local unpacker=table.unpack or unpack; local ok,a,b,c,d,e2,f2,g2,h2,i2,j2=pcall(function() return f(unpacker(args,1,#args)) end)`,
    `if not ok then error("FREZEN_VM_V3_CALL_NONFUNCTION:"..type(f)..":"..tostring(a)) end return {n=10,[1]=a,[2]=b,[3]=c,[4]=d,[5]=e2,[6]=f2,[7]=g2,[8]=h2,[9]=i2,[10]=j2}`,
    `end`,
    `${names.T}=function(e,x,multi)`,
    `if x[1]==${OPS.CONST} then return ${names.D}(x[2]) end`,
    `if x[1]==${OPS.VAR} then return ${names.Y}(e,${names.D}(x[2])) end`,
    `if x[1]==${OPS.VARARG} then local unpacker=table.unpack or unpack; local r=${names.R}(unpacker(e.a,1,e.a.n or 0)); if multi then return setmetatable(r,{__frezen_multi=true}) end return r[1] end`,
    `if x[1]==${OPS.INDEX} then local b=${names.T}(e,x[2],false); local k=${names.T}(e,x[3],false); return b[k] end`,
    `if x[1]==${OPS.UNARY} then local a=${names.T}(e,x[3],false); if x[2]==1 then return -a elseif x[2]==2 then return #a elseif x[2]==3 then return not a end end`,
    `if x[1]==${OPS.BIN} then local a=${names.T}(e,x[3],false); local b=${names.T}(e,x[4],false); local o=x[2]; if o==1 then return a+b elseif o==2 then return a-b elseif o==3 then return a*b elseif o==4 then return a/b elseif o==5 then return a%b elseif o==6 then return a^b elseif o==7 then return a..b elseif o==8 then return a==b elseif o==9 then return a~=b elseif o==10 then return a<b elseif o==11 then return a<=b elseif o==12 then return a>b elseif o==13 then return a>=b elseif o==14 then return math.floor(a/b) end end`,
    `if x[1]==${OPS.LOGIC} then local a=${names.T}(e,x[3],false); if x[2]==1 then return a and ${names.T}(e,x[4],false) or a end return a or ${names.T}(e,x[4],false) end`,
    `if x[1]==${OPS.CALL} then local f=${names.T}(e,x[2],false); local a={}; for i=1,#x[3] do local r=${names.T}(e,x[3][i],i==#x[3]); if i==#x[3] and type(r)==\"table\" and r.__frezen_multi then for j=1,r.n do a[#a+1]=r[j] end else a[i]=r end end; local r=${names.F}(f,a); if multi then return setmetatable(r,{__frezen_multi=true}) end return r[1] end`,
    `if x[1]==${OPS.MCALL} then local b=${names.T}(e,x[2],false); local k=${names.T}(e,x[3],false); local f=b[k]; local a={b}; for i=1,#x[4] do local r=${names.T}(e,x[4][i],i==#x[4]); if i==#x[4] and type(r)==\"table\" and r.__frezen_multi then for j=1,r.n do a[#a+1]=r[j] end else a[i+1]=r end end; local r=${names.F}(f,a); if multi then return setmetatable(r,{__frezen_multi=true}) end return r[1] end`,
    `if x[1]==${OPS.FUNC} then return {__frezen_v3=true,p=x[2],va=x[3],b=x[4],e=e} end`,
    `if x[1]==${OPS.TABLE} then local t={}; for i=1,#x[2] do local f=x[2][i]; if f[1]==1 then t[${names.D}(f[2])]=${names.T}(e,f[3]) elseif f[1]==2 then t[${names.T}(e,f[2])]=${names.T}(e,f[3]) else t[#t+1]=${names.T}(e,f[2]) end end return t end`,
    `error("FREZEN_VM_V3_BAD_EXPR")`,
    `end`,
    `${names.V}=function(e,l,expand)`,
    `local out={}; local n=#l; for i=1,n do local r=${names.T}(e,l[i],i==n and expand); if i==n and expand and type(r)=="table" and r.__frezen_multi then for j=1,r.n do out[#out+1]=r[j] end else out[#out+1]=r end end; return out`,
    `end`,
    `${names.U}=function(e,t)`,
    `if t[1]==1 then return {k=1,e=e,n=${names.D}(t[2])} end local b=${names.T}(e,t[2]); local k=${names.T}(e,t[3]); return {k=2,b=b,n=k}`,
    `end`,
    `${names.O}=function(b,e)`,
    `for pc=1,#b do local s=b[pc]; local op=s[1]`,
    `if op==${OPS.LOCAL} then local rhs=${names.V}(e,s[3],#s[2]>1); for i=1,#s[2] do local n=${names.D}(s[2][i]); e.h[n]=true; e.v[n]=rhs[i] end`,
    `elseif op==${OPS.SET} then local rhs=${names.V}(e,s[3],#s[2]>1); local targets={}; for i=1,#s[2] do targets[i]=${names.U}(e,s[2][i]) end; for i=1,#targets do local t=targets[i]; local v=rhs[i]; if t.k==1 then ${names.Z}(e,t.n,v) else t.b[t.n]=v end end`,
    `elseif op==${OPS.CALL_STMT} then ${names.T}(e,s[2])`,
    `elseif op==${OPS.RETURN} then return {k=1,v=${names.V}(e,s[2],true)}`,
    `elseif op==${OPS.BREAK} then return {k=2}`,
    `elseif op==${OPS.DO} then local r=${names.O}(s[2],{p=e,v={},h={},a={n=0}}); if r then if r.k==1 or r.k==2 then return r end end`,
    `elseif op==${OPS.IF} then local done=false; for i=1,#s[2] do if ${names.T}(e,s[2][i][1]) then local r=${names.O}(s[2][i][2],{p=e,v={},h={},a={}}); if r then return r end; done=true; break end end; if not done and #s[3]>0 then local r=${names.O}(s[3],{p=e,v={},h={},a={}}); if r then return r end end`,
    `elseif op==${OPS.WHILE} then while ${names.T}(e,s[2]) do local r=${names.O}(s[3],{p=e,v={},h={},a={}}); if r and r.k==1 then return r elseif r and r.k==2 then break end end`,
    `elseif op==${OPS.REPEAT} then repeat local r=${names.O}(s[2],{p=e,v={},h={},a={}}); if r and r.k==1 then return r elseif r and r.k==2 then break end until ${names.T}(e,s[3])`,
    `elseif op==${OPS.NUMFOR} then local a=${names.T}(e,s[3]); local z=${names.T}(e,s[4]); local st=${names.T}(e,s[5]); local q=a; while (st>=0 and q<=z) or (st<0 and q>=z) do local le={p=e,v={},h={},a={n=0}}; local n=${names.D}(s[2]); le.h[n]=true; le.v[n]=q; local r=${names.O}(s[6],le); if r and r.k==1 then return r elseif r and r.k==2 then break end; q=q+st end`,
    `elseif op==${OPS.GENFOR} then local it=${names.V}(e,s[3],true); local f=it[1]; local state=it[2]; local ctrl=it[3]; while true do local args={state,ctrl}; local rr=${names.F}(f,args); if rr[1]==nil then break end; ctrl=rr[1]; local le={p=e,v={},h={},a={}}; for i=1,#s[2] do local n=${names.D}(s[2][i]); le.h[n]=true; le.v[n]=rr[i] end; local r=${names.O}(s[4],le); if r and r.k==1 then return r elseif r and r.k==2 then break end end`,
    `elseif op==${OPS.FUNCDECL} then local f={__frezen_v3=true,p=s[4],va=s[5],b=s[6],e=e}; local target=s[3]; if target[1]==1 then local n=${names.D}(target[2]); if s[2] then e.h[n]=true end; ${names.Z}(e,n,f) else local b=${names.T}(e,target[2]); local k=${names.T}(e,target[3]); b[k]=f end`,
    `end end return nil`,
    `end`,
    `do local r=${names.O}(${names.K},${names.E}); if r and r.k==1 then local unpacker=table.unpack or unpack; return unpacker(r.v,1,#r.v) end end`,
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
      strings: 'lazy-constant-pool',
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
