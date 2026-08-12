// CoffeInjector — utilitários de nomenclatura (puro, sem dependência do VS Code)

const KNOWN_SUFFIXES = [
    'Controller',
    'Service',
    'Repository',
    'Component',
    'Configuration',
    'Config',
    'Manager',
    'Helper',
    'Util',
    'Utils',
    'Client',
    'Factory',
    'Provider',
    'Handler',
    'Impl',
    'Mapper',
].sort((a, b) => b.length - a.length);

/**
 * Converte um identificador PascalCase (ou qualquer string) para camelCase.
 * "CoffeAgentService" -> "coffeAgentService"; "RedisService" -> "redisService".
 * @param {string} name
 * @returns {string}
 */
function toCamelCase(name) {
    if (!name) {
        return name;
    }
    return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * Remove um sufixo conhecido do final do nome, se houver.
 * "CoffeAgentService" -> "CoffeAgent"; "UserRepository" -> "User".
 * Nunca remove o sufixo se o nome restante ficar vazio.
 * @param {string} className
 * @returns {string} nome sem sufixo, ou o original se não houver sufixo conhecido
 */
function stripKnownSuffix(className) {
    for (const suffix of KNOWN_SUFFIXES) {
        if (className.endsWith(suffix) && className.length > suffix.length) {
            return className.slice(0, className.length - suffix.length);
        }
    }
    return className;
}

/**
 * Calcula um nome de campo seguro e semântico para uma classe.
 *
 * Estratégia (por prioridade, conforme o spec):
 * 1. evitar conflito (usar usedNames)
 * 2. preservar significado (remover sufixo conhecido quando seguro)
 * 3. usar camelCase como fallback
 *
 * Com `stripSuffix=false`, sempre usa o camelCase completo da classe.
 *
 * @param {string} className
 * @param {ReadonlySet<string>|string[]} usedNames nomes já usados (campos/parâmetros)
 * @param {{stripSuffix?: boolean}} [options]
 * @returns {string}
 */
function computeFieldName(className, usedNames, options = {}) {
    const used = new Set(usedNames || []);
    const stripSuffix = options.stripSuffix !== false;

    const base = stripSuffix ? stripKnownSuffix(className) : className;
    let candidate = toCamelCase(base);

    if (!used.has(candidate)) {
        return candidate;
    }

    // Conflito com nome "natural": tentar fallback para camelCase completo da classe.
    const fullName = toCamelCase(className);
    if (fullName !== candidate && !used.has(fullName)) {
        return fullName;
    }

    // Conflito persistente: numerar (name, name2, name3, ...).
    let i = 2;
    let numbered = `${candidate}${i}`;
    while (used.has(numbered) && i < 1000) {
        i += 1;
        numbered = `${candidate}${i}`;
    }
    return numbered;
}

module.exports = {
    KNOWN_SUFFIXES,
    toCamelCase,
    stripKnownSuffix,
    computeFieldName,
};
