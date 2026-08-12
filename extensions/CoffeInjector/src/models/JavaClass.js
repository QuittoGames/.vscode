// CoffeInjector — modelo de classe Java (DTO puro, sem dependência do VS Code)

/**
 * @typedef {Object} JavaClass
 * @property {string} name Nome simples da classe.
 * @property {string|null} packageName Package declarado (ou null).
 * @property {string} fqcn Nome totalmente qualificado (package + name).
 * @property {string} filePath Caminho absoluto do arquivo no disco.
 * @property {string[]} annotations Anotações da classe (nomes simples, sem @).
 * @property {boolean} isInterface Se é interface.
 * @property {boolean} isEnum Se é enum.
 * @property {boolean} isRecord Se é record.
 * @property {string} kind class | interface | enum | record | annotation
 */

/**
 * Converte uma declaração top-level (produzida pelo parser) em um JavaClass indexável.
 * @param {{name:string,kind:string,annotations:string[]}} decl
 * @param {{packageName:string|null}} parsed
 * @param {string} filePath
 * @returns {JavaClass}
 */
function toJavaClass(decl, parsed, filePath) {
    const packageName = parsed.packageName || null;
    return {
        name: decl.name,
        packageName,
        fqcn: packageName ? `${packageName}.${decl.name}` : decl.name,
        filePath,
        annotations: decl.annotations || [],
        isInterface: decl.kind === 'interface',
        isEnum: decl.kind === 'enum',
        isRecord: decl.kind === 'record',
        kind: decl.kind,
    };
}

module.exports = { toJavaClass };
