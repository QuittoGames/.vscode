// CoffeInjector — test/inject.flow.test.js
// End-to-end dos módulos puros: simula o fluxo do comando sem o VS Code.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseFile, findPrimaryDeclaration } = require('../src/java/JavaClassParser');
const ImportManager = require('../src/java/ImportManager');
const FieldManager = require('../src/java/FieldManager');
const ConstructorManager = require('../src/java/ConstructorManager');
const { computeFieldName } = require('../src/utils/naming');
const { detectIndentUnit } = require('../src/utils/format');

const INDENT = '    ';

function applyEdits(text, edits) {
    const sorted = [...edits].sort((a, b) => b.offset - a.offset);
    let out = text;
    for (const e of sorted) {
        out = out.slice(0, e.offset) + e.text + out.slice(e.offset);
    }
    return out;
}

test('flow: injects service into controller with existing constructor', () => {
    const targetSrc = `package com.example.web;

import com.example.app.BaseController;

@RestController
public class CoffeController extends BaseController {

    private final UserRepository userRepository;

    public CoffeController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }
}
`;
    const dep = { name: 'CoffeService', packageName: 'com.example.app.service', fqcn: 'com.example.app.service.CoffeService' };

    const parsed = parseFile(targetSrc);
    const classDecl = findPrimaryDeclaration(parsed, 'CoffeController.java');
    const fieldName = computeFieldName(dep.name, new Set(['userRepository']), { stripSuffix: true });

    const importPlan = ImportManager.planImport(targetSrc, dep, parsed.packageName, parsed.imports);
    assert.equal(importPlan.skip, undefined);
    assert.equal(importPlan.edits.length, 1);

    const fieldPlan = FieldManager.planField(targetSrc, classDecl, dep, fieldName, INDENT);
    assert.equal(fieldPlan.alreadyInjected, false);

    const ctorPlan = ConstructorManager.planConstructor(targetSrc, classDecl, dep, fieldName, INDENT);
    assert.equal(ctorPlan.mode, 'extend');

    const edits = [];
    edits.push(...importPlan.edits);
    edits.push(...fieldPlan.edits);
    edits.push(...ctorPlan.edits);
    const out = applyEdits(targetSrc, edits);

    assert.match(out, /import com\.example\.app\.service\.CoffeService;/);
    assert.match(out, new RegExp(`private final CoffeService ${fieldName};`));
    assert.match(out, new RegExp(`public CoffeController\\(UserRepository userRepository, CoffeService ${fieldName}\\)`));
    assert.match(out, new RegExp(`this\\.${fieldName} = ${fieldName};`));
});

test('flow: same package creates field + constructor together', () => {
    const targetSrc = `package com.example.app;

public class CoffeApp {

    public void run() {
    }
}
`;
    const dep = { name: 'CoffeService', packageName: 'com.example.app', fqcn: 'com.example.app.CoffeService' };

    const parsed = parseFile(targetSrc);
    const classDecl = findPrimaryDeclaration(parsed, 'CoffeApp.java');
    const fieldName = computeFieldName(dep.name, new Set(), { stripSuffix: true });

    const importPlan = ImportManager.planImport(targetSrc, dep, parsed.packageName, parsed.imports);
    assert.equal(importPlan.skip, 'same-package');
    assert.equal(importPlan.edits.length, 0);

    const fieldPlan = FieldManager.planField(targetSrc, classDecl, dep, fieldName, INDENT);
    assert.equal(fieldPlan.alreadyInjected, false);

    const ctorPlan = ConstructorManager.planConstructor(targetSrc, classDecl, dep, fieldName, INDENT);
    assert.equal(ctorPlan.mode, 'create');

    // Composição idêntica à do comando (single edit no mesmo offset = atômico).
    const edits = [{ offset: classDecl.bodyStart + 1, text: `\n\n${fieldPlan.fieldLine}\n\n${ctorPlan.ctorBlock}` }];
    const out = applyEdits(targetSrc, edits);

    assert.match(out, new RegExp(`private final CoffeService ${fieldName};`));
    assert.match(out, new RegExp(`public CoffeApp\\(CoffeService ${fieldName}\\) \\{\\n\\s*this\\.${fieldName} = ${fieldName};`));
});

test('flow: existing field with same type short-circuits injection', () => {
    const targetSrc = `package com.example.app;

import com.example.app.service.CoffeService;

public class CoffeApp {

    private final CoffeService coffeService;

    public CoffeApp() {
    }
}
`;
    const dep = { name: 'CoffeService', packageName: 'com.example.app.service', fqcn: 'com.example.app.service.CoffeService' };

    const parsed = parseFile(targetSrc);
    const classDecl = findPrimaryDeclaration(parsed, 'CoffeApp.java');
    const fieldPlan = FieldManager.planField(targetSrc, classDecl, dep, 'coffeService', INDENT);
    assert.equal(fieldPlan.alreadyInjected, true);
});

test('flow: indent unit detection returns spaces or tab', () => {
    assert.equal(detectIndentUnit('public class X {\n    int a;\n}\n'), '    ');
    assert.equal(detectIndentUnit('public class X {\n\tint a;\n}\n'), '\t');
});
