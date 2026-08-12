// CoffeInjector — gerencia o construtor da classe (puro, sem dependência do VS Code).
// Detecta construtor existente, cria quando ausente e adiciona parâmetro + atribuição.

const LOMBOK_CTOR_ANNOTATIONS = [
    'RequiredArgsConstructor',
    'AllArgsConstructor',
    'Value',
    'Data',
];

/**
 * Verifica se a classe usa anotações Lombok que geram construtor em tempo de compilação.
 * @param {string[]} classAnnotations
 * @returns {boolean}
 */
function isLombokGeneratedConstructor(classAnnotations) {
    return classAnnotations.some((a) => LOMBOK_CTOR_ANNOTATIONS.includes(a));
}

/**
 * Encontra o offset após o último token de parâmetro (antes do ")" e de whitespace).
 * @param {string} docText
 * @param {object} ctor
 * @returns {number}
 */
function findLastParamEnd(docText, ctor) {
    let i = ctor.paramListEnd - 1;
    while (i > ctor.paramListStart && /\s/.test(docText[i])) {
        i -= 1;
    }
    return i + 1;
}

/**
 * Encontra o offset onde a atribuição `this.x = x;` deve ser inserida.
 * Insere após o `{`, mas respeitando chamadas `super(...)`/`this(...)` iniciais.
 * @param {string} docText
 * @param {object} ctor
 * @returns {number}
 */
function findAssignmentOffset(docText, ctor) {
    const bodyText = docText.slice(ctor.bodyStart + 1, ctor.bodyEnd);
    const semiIdx = bodyText.indexOf(';');
    if (semiIdx !== -1) {
        const firstStmt = bodyText.slice(0, semiIdx + 1).trim();
        if (/^(super|this)\s*\(/.test(firstStmt)) {
            return ctor.bodyStart + 1 + semiIdx + 1;
        }
    }
    return ctor.bodyStart + 1;
}

/**
 * Seleciona o construtor-alvo entre vários:
 * prioridade @Autowired/@Inject > mais parâmetros > primeiro.
 * @param {object[]} ctors
 * @returns {object}
 */
function pickTargetConstructor(ctors) {
    const autowired = ctors.find((c) =>
        c.annotations.some((a) => a === 'Autowired' || a === 'Inject')
    );
    if (autowired) return autowired;
    return ctors.reduce((best, c) => (c.params.length > best.params.length ? c : best), ctors[0]);
}

/**
 * Planeja a edição do construtor para injetar a dependência.
 *
 * @param {string} docText conteúdo do arquivo
 * @param {object} classDecl declaração primária da classe atual (do parser)
 * @param {{name:string}} dep dependência
 * @param {string} fieldName nome do campo já resolvido
 * @param {string} indent unit de indentação
 * @returns {object} { mode, block?, edits?, alreadyInjected?, lombok? }
 */
function planConstructor(docText, classDecl, dep, fieldName, indent) {
    const classIndent = getLineIndentOf(docText, classDecl.lineStart);
    const memberIndent = classIndent + indent;

    if (isLombokGeneratedConstructor(classDecl.annotations)) {
        return { mode: 'lombok', lombok: true };
    }

    const ctors = classDecl.constructors || [];

    const alreadyInjected = ctors.some((c) =>
        c.params.some((p) => simpleTypeName(p.type) === dep.name)
    );
    if (alreadyInjected) {
        return { mode: 'already', alreadyInjected: true };
    }

    if (ctors.length === 0) {
        const bodyIndent = memberIndent + indent;
        const ctorBlock =
            `${memberIndent}public ${classDecl.name}(${dep.name} ${fieldName}) {\n` +
            `${bodyIndent}this.${fieldName} = ${fieldName};\n` +
            `${memberIndent}}`;
        return { mode: 'create', ctorBlock, memberIndent };
    }

    const target = pickTargetConstructor(ctors);
    const edits = [];

    const lastParamEnd = findLastParamEnd(docText, target);
    const multiline = target.multiline;
    if (target.params.length === 0) {
        // Construtor sem parâmetros: inserir apenas o novo parâmetro.
        edits.push({
            offset: lastParamEnd,
            text: multiline ? `\n${memberIndent}${indent}${dep.name} ${fieldName}` : `${dep.name} ${fieldName}`,
        });
    } else if (multiline) {
        const paramIndent = getLineIndentOf(docText, lastParamEnd);
        edits.push({
            offset: lastParamEnd,
            text: `,\n${paramIndent}${dep.name} ${fieldName}`,
        });
    } else {
        edits.push({ offset: lastParamEnd, text: `, ${dep.name} ${fieldName}` });
    }

    const bodyIndent = memberIndent + indent;
    const assignOffset = findAssignmentOffset(docText, target);
    // Se o corpo já começa com quebra de linha, insere DEPOIS dela para evitar linha em branco extra.
    const afterNewline = docText[assignOffset] === '\n';
    edits.push({
        offset: afterNewline ? assignOffset + 1 : assignOffset,
        text: `${afterNewline ? '' : '\n'}${bodyIndent}this.${fieldName} = ${fieldName};`,
    });

    return { mode: 'extend', edits };
}

/**
 * Nome simples de um tipo (remove generics/package).
 * @param {string} type
 * @returns {string}
 */
function simpleTypeName(type) {
    return type
        .split(/[.<]/)[0]
        .split(' ')[0]
        .trim();
}

/**
 * Whitespace inicial da linha que contém o offset.
 * @param {string} text
 * @param {number} offset
 * @returns {string}
 */
function getLineIndentOf(text, offset) {
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const lineEnd = text.indexOf('\n', lineStart) === -1 ? text.length : text.indexOf('\n', lineStart);
    const line = text.slice(lineStart, lineEnd);
    const m = line.match(/^[ \t]*/);
    return m ? m[0] : '';
}

module.exports = {
    isLombokGeneratedConstructor,
    planConstructor,
    findLastParamEnd,
    findAssignmentOffset,
    pickTargetConstructor,
    simpleTypeName,
};
