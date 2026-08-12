// CoffeInjector — parser text-based de arquivos Java (puro, sem dependência do VS Code).
// v1: mini state machine por linha (strings/comentários) + regex de declarações.
// O contrato `ParsedJavaFile` foi desenhado para permitir trocar esta implementação
// por um parser real (tree-sitter / JavaParser) sem refatorar o resto.

const TYPE_KEYWORD = '(?:class|interface|enum|record)';

/**
 * Substitui strings, text blocks e comentários por espaços, preservando
 * newlines e offsets. Retorna um "source limpo" com o mesmo comprimento.
 * @param {string} text
 * @returns {string}
 */
function cleanSource(text) {
    const out = new Array(text.length);
    let i = 0;
    const n = text.length;
    let state = 'code'; // code | line | block | str | tstr | ch
    while (i < n) {
        const c = text[i];
        const d = text[i + 1];
        if (state === 'code') {
            if (c === '/' && d === '/') {
                out[i] = ' '; out[i + 1] = ' '; state = 'line'; i += 2; continue;
            }
            if (c === '/' && d === '*') {
                out[i] = ' '; out[i + 1] = ' '; state = 'block'; i += 2; continue;
            }
            if (c === '"' && d === '"' && text[i + 2] === '"') {
                out[i] = ' '; out[i + 1] = ' '; out[i + 2] = ' '; state = 'tstr'; i += 3; continue;
            }
            if (c === '"') {
                out[i] = ' '; state = 'str'; i += 1; continue;
            }
            if (c === "'") {
                out[i] = ' '; state = 'ch'; i += 1; continue;
            }
            out[i] = c; i += 1; continue;
        }
        if (state === 'line') {
            out[i] = c === '\n' ? '\n' : ' ';
            if (c === '\n') state = 'code';
            i += 1; continue;
        }
        if (state === 'block') {
            if (c === '*' && d === '/') { out[i] = ' '; out[i + 1] = ' '; i += 2; state = 'code'; continue; }
            out[i] = c === '\n' ? '\n' : ' ';
            i += 1; continue;
        }
        if (state === 'str') {
            if (c === '\\') { out[i] = ' '; if (i + 1 < n) out[i + 1] = ' '; i += 2; continue; }
            if (c === '"') { out[i] = ' '; state = 'code'; i += 1; continue; }
            if (c === '\n') { out[i] = '\n'; state = 'code'; i += 1; continue; }
            out[i] = ' '; i += 1; continue;
        }
        if (state === 'tstr') {
            if (c === '"' && d === '"' && text[i + 2] === '"') { out[i] = ' '; out[i + 1] = ' '; out[i + 2] = ' '; i += 3; state = 'code'; continue; }
            out[i] = c === '\n' ? '\n' : ' ';
            i += 1; continue;
        }
        if (state === 'ch') {
            if (c === '\\') { out[i] = ' '; if (i + 1 < n) out[i + 1] = ' '; i += 2; continue; }
            if (c === "'") { out[i] = ' '; state = 'code'; i += 1; continue; }
            if (c === '\n') { out[i] = '\n'; state = 'code'; i += 1; continue; }
            out[i] = ' '; i += 1; continue;
        }
    }
    return out.join('');
}

/**
 * Calcula os ranges de cada linha (end exclui o newline/\r).
 * @param {string} text
 * @returns {{start:number,end:number}[]}
 */
function lineRanges(text) {
    const ranges = [];
    let start = 0;
    for (let i = 0; i < text.length; i += 1) {
        if (text[i] === '\n') {
            ranges.push({ start, end: i });
            start = i + 1;
        }
    }
    ranges.push({ start, end: text.length });
    return ranges.map((r) => (r.end > r.start && text[r.end - 1] === '\r' ? { start: r.start, end: r.end - 1 } : r));
}

/**
 * Encontra o índice do caractere de fechamento correspondente ao de abertura.
 * Opera sobre o texto LIMPO (strings/comentários já são espaços).
 * @param {string} clean
 * @param {number} openIdx
 * @param {string} openChar
 * @param {string} closeChar
 * @returns {number} índice do close, ou -1
 */
function findMatching(clean, openIdx, openChar, closeChar) {
    let depth = 0;
    for (let i = openIdx; i < clean.length; i += 1) {
        if (clean[i] === openChar) depth += 1;
        else if (clean[i] === closeChar) {
            depth -= 1;
            if (depth === 0) return i;
        }
    }
    return -1;
}

/**
 * Divide um texto por vírgulas de nível superior, respeitando <> e ().
 * @param {string} text
 * @returns {string[]}
 */
function splitTopLevel(text) {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i += 1) {
        const c = text[i];
        if (c === '<' || c === '(') depth += 1;
        else if (c === '>' || c === ')') depth -= 1;
        else if (c === ',' && depth === 0) {
            parts.push(text.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(text.slice(start));
    return parts;
}

/**
 * Extrai parâmetros de um texto entre parênteses.
 * "SomeService someService" -> [{type:"SomeService", name:"someService"}]
 * @param {string} paramText
 * @returns {{type:string,name:string}[]}
 */
function extractParams(paramText) {
    if (!paramText.trim()) return [];
    return splitTopLevel(paramText).map(parseParam).filter(Boolean);
}

function parseParam(chunk) {
    let s = chunk.trim();
    if (!s) return null;
    while (s.startsWith('@')) {
        const m = s.match(/^@[\w.]+(?:\([^)]*\))?/);
        if (!m) break;
        s = s.slice(m[0].length).trim();
    }
    s = s.replace(/^final\s+/, '');
    const tokens = s.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return null;
    const name = tokens[tokens.length - 1].replace(/\.{3}$/, '');
    const type = tokens.slice(0, -1).join(' ');
    return { type, name };
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Coleta anotações de uma linha para cima (linhas consecutivas começando com @).
 * @param {string[]} cleanLines
 * @param {number} lineIdx
 * @returns {string[]}
 */
function collectAnnotations(cleanLines, lineIdx) {
    const annotations = [];
    for (let i = lineIdx - 1; i >= 0; i -= 1) {
        const t = cleanLines[i].trim();
        if (!t) break;
        const m = t.match(/^@([A-Za-z_$][\w$]*)/);
        if (!m) break;
        annotations.push(m[1]);
        // anotação com argumentos multi-linha: continua enquanto a linha terminar com ( , ou início de arg
        const continues = /\(\s*$/.test(t) || /,\s*$/.test(t) || /^[\w.]+$/.test(t) === false;
        if (!continues) {
            break;
        }
    }
    return annotations.reverse();
}

/**
 * Calcula o offset do caractere de abertura "{" do corpo da classe,
 * procurando após o nome da classe (evita chaves de anotações antes do nome).
 * @param {string} clean
 * @param {string} declLine
 * @param {string} declLineText
 * @param {number} lineStart
 * @param {string} name
 * @returns {number}
 */
function findClassBodyOpen(clean, declLineText, lineStart, name) {
    const nameRe = new RegExp(`\\b${escapeRegExp(name)}\\b`);
    const m = declLineText.match(nameRe);
    const from = m ? lineStart + m.index + m[0].length : lineStart;
    const brace = clean.indexOf('{', from);
    return brace;
}

/**
 * Detecta e parseia os construtores da classe dentro de [bodyStart, bodyEnd].
 * @param {string} text
 * @param {string} clean
 * @param {string[]} cleanLines
 * @param {number[]} lineStarts
 * @param {string} className
 * @param {number} bodyStart
 * @param {number} bodyEnd
 * @returns {object[]}
 */
function extractConstructors(text, clean, cleanLines, lineStarts, className, bodyStart, bodyEnd) {
    const constructors = [];
    const ctorRe = new RegExp(
        `^\\s*(?:public\\s+|protected\\s+|private\\s+)?${escapeRegExp(className)}\\s*\\(`
    );
    for (let li = 0; li < cleanLines.length; li += 1) {
        const lineStart = lineStarts[li];
        if (lineStart < bodyStart || lineStart > bodyEnd) continue;
        const lt = cleanLines[li];
        const cm = lt.match(ctorRe);
        if (!cm) continue;
        const openParen = lineStart + cm[0].indexOf('(');
        const closeParen = findMatching(clean, openParen, '(', ')');
        if (closeParen === -1 || closeParen > bodyEnd) continue;
        const paramText = text.slice(openParen + 1, closeParen);
        const params = extractParams(paramText);
        const bodyOpen = clean.indexOf('{', closeParen);
        if (bodyOpen === -1 || bodyOpen > bodyEnd) continue;
        const bodyClose = findMatching(clean, bodyOpen, '{', '}');
        if (bodyClose === -1) continue;
        const annotations = collectAnnotations(cleanLines, li);
        constructors.push({
            startOffset: lineStart,
            endOffset: bodyClose,
            annotations,
            params,
            paramListStart: openParen,
            paramListEnd: closeParen,
            bodyStart: bodyOpen,
            bodyEnd: bodyClose,
            multiline: /\r?\n/.test(paramText),
        });
    }
    return constructors;
}

/**
 * Parseia um arquivo Java.
 * @param {string} text conteúdo do arquivo
 * @returns {object} ParsedJavaFile
 */
function parseFile(text) {
    const clean = cleanSource(text);
    const ranges = lineRanges(clean);
    const cleanLines = ranges.map((r) => clean.slice(r.start, r.end));
    const lineStarts = ranges.map((r) => r.start);

    const parsed = {
        packageName: null,
        imports: [],
        declarations: [],
        clean,
    };

    const TYPE_DECL_RE = new RegExp(
        `^(?:(?:public|protected|private|static|final|abstract|sealed|non-sealed|@\\w+)\\s+)*(${TYPE_KEYWORD})\\s+([A-Za-z_$][\\w$]*)`
    );
    const ANNOTATION_TYPE_RE = /^@interface\s+([A-Za-z_$][\w$]*)/;

    for (let li = 0; li < cleanLines.length; li += 1) {
        const lt = cleanLines[li];
        const trimmed = lt.trim();

        if (!parsed.packageName) {
            const pm = trimmed.match(/^package\s+([\w.]+)\s*;?$/);
            if (pm) {
                parsed.packageName = pm[1];
                continue;
            }
        }

        const im = trimmed.match(/^import\s+(?:static\s+)?([\w.]+)\s*;?$/);
        if (im) {
            parsed.imports.push({
                fqcn: im[1],
                isStatic: /^import\s+static/.test(trimmed),
            });
            continue;
        }

        const am = lt.match(ANNOTATION_TYPE_RE);
        let kind = null;
        let name = null;
        if (am) {
            kind = 'annotation';
            name = am[1];
        } else {
            const dm = lt.match(TYPE_DECL_RE);
            if (dm) {
                kind = dm[1];
                name = dm[2];
            }
        }

        if (!kind || !name) continue;

        const isTopLevel = !/^[ \t]/.test(lt);
        const annotations = collectAnnotations(cleanLines, li);

        const bodyOpen = findClassBodyOpen(clean, lt, lineStarts[li], name);
        const bodyStart = bodyOpen === -1 ? -1 : bodyOpen + 1;
        const bodyEnd = bodyOpen === -1 ? -1 : findMatching(clean, bodyOpen, '{', '}');

        const decl = {
            name,
            kind,
            annotations,
            isTopLevel,
            line: li,
            lineStart: lineStarts[li],
            bodyStart,
            bodyEnd,
            constructors: [],
        };

        if (bodyStart !== -1 && bodyEnd !== -1) {
            decl.constructors = extractConstructors(
                text,
                clean,
                cleanLines,
                lineStarts,
                name,
                bodyStart,
                bodyEnd
            );
        }

        parsed.declarations.push(decl);
    }

    return parsed;
}

/**
 * Retorna a declaração principal do arquivo (mesmo nome do arquivo, senão a primeira classe top-level).
 * @param {object} parsed
 * @param {string} fileName
 * @returns {object|null}
 */
function findPrimaryDeclaration(parsed, fileName) {
    const top = parsed.declarations.filter((d) => d.isTopLevel);
    if (top.length === 0) return null;
    const base = fileName.replace(/\.java$/i, '');
    return top.find((d) => d.name === base) || top[0];
}

module.exports = {
    cleanSource,
    parseFile,
    findPrimaryDeclaration,
    findMatching,
    splitTopLevel,
    extractParams,
};
