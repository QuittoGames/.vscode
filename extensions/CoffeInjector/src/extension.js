// CoffeInjector — extensão (ponto de entrada)

const vscode = require('vscode');
const { JavaClassScanner } = require('./java/JavaClassScanner');
const { runInjectClass } = require('./commands/injectClass');

/**
 * Ativa a extensão: registra o comando de injeção e o scanner de classes Java.
 * @param {import('vscode').ExtensionContext} context
 */
function activate(context) {
    const scanner = new JavaClassScanner(context);

    context.subscriptions.push(
        vscode.commands.registerCommand('springInjectClass.injectClass', () =>
            runInjectClass(scanner)
        )
    );
}

/**
 * Desativa a extensão.
 */
function deactivate() {
    // Sem estado global: o scanner é descartado com o contexto.
}

module.exports = { activate, deactivate };
