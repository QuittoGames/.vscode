// CoffeInjector — gerencia imports da classe (puro, sem dependência do VS Code).
// Recebe texto + contexto e retorna EditSpec[] (apenas inserções). Nunca substitui conteúdo.

/**
 * @typedef {Object} EditSpec
 * @property {number} offset offset de caractere absoluto onde o texto será inserido
 * @property {string} text texto a inserir
 */

/**
 * Encontra o offset do caractere ";" de fechamento da declaração package (se houver).
 * @param {string} text
 * @returns {number} offset após o ";" do package, ou -1
 */
function findPackageEnd(text) {
    const m = text.match(/^\s*package\s+[\w.]+\s*;/m);
    if (!m) return -1;
    return m.index + m[0].length;
}

/**
 * Encontra o offset após o ";" da última declaração import (se houver).
 * @param {string} text
 * @returns {number} offset após o ";" do último import, ou -1
 */
function findLastImportEnd(text) {
    const matches = [...text.matchAll(/^\s*import\s+(?:static\s+)?[\w.]+\s*;/gm)];
    if (matches.length === 0) return -1;
    const last = matches[matches.length - 1];
    return last.index + last[0].length;
}

/**
 * Nome simples de um FQCN (último segmento).
 * @param {string} fqcn
 * @returns {string}
 */
function simpleName(fqcn) {
    return fqcn.split('.').pop();
}

/**
 * Planeja a inserção do import da dependência no documento.
 *
 * @param {string} docText conteúdo atual do arquivo
 * @param {{name:string, packageName:string|null, fqcn:string}} dep classe dependência
 * @param {string|null} docPackageName package da classe atual
 * @param {{fqcn:string,isStatic:boolean}[]} existingImports imports já presentes
 * @returns {{edits: EditSpec[], skip?: 'same-package'|'already-imported'|'ambiguous'}}
 */
function planImport(docText, dep, docPackageName, existingImports) {
    const targetPackage = dep.packageName;

    if (targetPackage && docPackageName && targetPackage === docPackageName) {
        return { edits: [], skip: 'same-package' };
    }
    if (!targetPackage && !docPackageName) {
        return { edits: [], skip: 'same-package' };
    }

    if (existingImports.some((i) => i.fqcn === dep.fqcn)) {
        return { edits: [], skip: 'already-imported' };
    }

    const conflicting = existingImports.some(
        (i) => !i.isStatic && i.fqcn !== dep.fqcn && simpleName(i.fqcn) === dep.name
    );
    if (conflicting) {
        return { edits: [], skip: 'ambiguous' };
    }

    const importLine = `import ${dep.fqcn};`;

    const lastImportEnd = findLastImportEnd(docText);
    if (lastImportEnd !== -1) {
        return { edits: [{ offset: lastImportEnd, text: `\n${importLine}` }] };
    }

    const packageEnd = findPackageEnd(docText);
    if (packageEnd !== -1) {
        return { edits: [{ offset: packageEnd, text: `\n\n${importLine}` }] };
    }

    return { edits: [{ offset: 0, text: `${importLine}\n` }] };
}

module.exports = { planImport, findPackageEnd, findLastImportEnd, simpleName };
