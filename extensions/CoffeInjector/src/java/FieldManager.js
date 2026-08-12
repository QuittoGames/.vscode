// CoffeInjector — gerencia o campo `private final` da classe (puro, sem dependência do VS Code).
// Detecta campos existentes, resolve nomes em conflito e gera o EditSpec de inserção do campo.

/**
 * Nome simples de um tipo (remove generics/package).
 * "Map<String, Foo>" -> "Map"; "com.x.Foo" -> "Foo".
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
 * Extrai campos declarados na classe a partir do texto (heurística text-based).
 * @param {string} classBody text dentro das chaves da classe
 * @returns {{name:string, type:string}[]}
 */
function extractFields(classBody) {
    const fields = [];
    const re = /(?:^|\n)\s*(?:private|protected|public)\s+(?:static\s+)?(?:final\s+)?([\w<>.?,\[\] ]+?)\s+([a-zA-Z_$][\w$]*)\s*(?:=|;)/g;
    let m;
    while ((m = re.exec(classBody)) !== null) {
        fields.push({ name: m[2], type: m[1].trim() });
    }
    return fields;
}

/**
 * Verifica se um campo com o mesmo tipo já existe na classe.
 * @param {string} classBody
 * @param {string} depSimpleName
 * @returns {{name:string,type:string}|null}
 */
function findExistingFieldOfType(classBody, depSimpleName) {
    const fields = extractFields(classBody);
    return fields.find((f) => simpleTypeName(f.type) === depSimpleName) || null;
}

/**
 * Planeja a inserção do campo `private final <Type> <name>;` dentro da classe.
 *
 * @param {string} docText conteúdo do arquivo
 * @param {object} classDecl declaração primária da classe atual (do parser)
 * @param {{name:string, fqcn:string}} dep dependência
 * @param {string} fieldName nome do campo já resolvido (sem conflitos)
 * @param {string} indent unit de indentação ("    " ou "\t")
 * @returns {{edits: EditSpec[], fieldLine: string, alreadyInjected: boolean, existingField: object|null}}
 */
function planField(docText, classDecl, dep, fieldName, indent) {
    const body = docText.slice(classDecl.bodyStart + 1, classDecl.bodyEnd);

    const existing = findExistingFieldOfType(body, dep.name);
    if (existing) {
        return { edits: [], fieldLine: '', alreadyInjected: true, existingField: existing };
    }

    const classIndent = getLineIndent(docText, classDecl.lineStart);
    const memberIndent = classIndent + indent;
    const fieldLine = `${memberIndent}private final ${dep.name} ${fieldName};`;

    // Insere logo após a chave de abertura da classe (bodyStart aponta para "{", +1 = início do corpo).
    const offset = classDecl.bodyStart + 1;
    return {
        edits: [{ offset, text: `\n\n${fieldLine}` }],
        fieldLine,
        alreadyInjected: false,
        existingField: null,
    };
}

/**
 * Retorna o whitespace inicial da linha que contém o offset.
 * @param {string} text
 * @param {number} offset
 * @returns {string}
 */
function getLineIndent(text, offset) {
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const lineEnd = text.indexOf('\n', lineStart) === -1 ? text.length : text.indexOf('\n', lineStart);
    const line = text.slice(lineStart, lineEnd);
    const m = line.match(/^[ \t]*/);
    return m ? m[0] : '';
}

module.exports = {
    simpleTypeName,
    extractFields,
    findExistingFieldOfType,
    planField,
    getLineIndent,
};
