// CoffeInjector — utilitários de formatação (puro, sem dependência do VS Code).

/**
 * Detecta a unidade de indentação do arquivo (espaços ou tab).
 * @param {string} text
 * @returns {string} "    " (4 espaços por padrão) ou "\t"
 */
function detectIndentUnit(text) {
    const lines = text.split('\n');
    const counts = new Map();
    for (const line of lines) {
        const m = line.match(/^ +/);
        if (m && m[0].length > 0 && m[0].length < 8) {
            counts.set(m[0].length, (counts.get(m[0].length) || 0) + 1);
        }
    }
    if (lines.some((l) => /^\t/.test(l))) {
        return '\t';
    }
    let best = 4;
    let bestCount = 0;
    for (const [len, count] of counts) {
        if (count > bestCount) {
            best = len;
            bestCount = count;
        }
    }
    return ' '.repeat(best);
}

module.exports = { detectIndentUnit };
