// CoffeInjector — test/constructor.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseFile, findPrimaryDeclaration } = require('../src/java/JavaClassParser');
const { planConstructor } = require('../src/java/ConstructorManager');

const INDENT = '    ';

function declOf(src, fileName = 'X.java') {
    const parsed = parseFile(src);
    const decl = findPrimaryDeclaration(parsed, fileName);
    return { docText: src, classDecl: decl };
}

function applyEdits(text, edits) {
    const sorted = [...edits].sort((a, b) => b.offset - a.offset);
    let out = text;
    for (const e of sorted) {
        out = out.slice(0, e.offset) + e.text + out.slice(e.offset);
    }
    return out;
}

test('create: generates constructor when none exists', () => {
    const { docText, classDecl } = declOf('public class X {\n}\n');
    const plan = planConstructor(docText, classDecl, { name: 'CoffeService' }, 'coffeService', INDENT);
    assert.equal(plan.mode, 'create');
    assert.match(plan.ctorBlock, /public X\(CoffeService coffeService\) \{\n/);
    assert.match(plan.ctorBlock, /this\.coffeService = coffeService;/);
});

test('extend: single-line constructor gets param + assignment', () => {
    const src = 'public class X {\n    private final A a;\n    public X(A a) {\n        this.a = a;\n    }\n}\n';
    const { docText, classDecl } = declOf(src);
    const plan = planConstructor(docText, classDecl, { name: 'CoffeService' }, 'coffeService', INDENT);
    assert.equal(plan.mode, 'extend');
    const out = applyEdits(docText, plan.edits);
    assert.match(out, /public X\(A a, CoffeService coffeService\)/);
    assert.match(out, /this\.coffeService = coffeService;/);
});

test('extend: multiline constructor appends param with indent', () => {
    const src = 'public class X {\n    public X(\n            A a,\n            B b) {\n        this.a = a;\n        this.b = b;\n    }\n}\n';
    const { docText, classDecl } = declOf(src);
    const plan = planConstructor(docText, classDecl, { name: 'CoffeService' }, 'coffeService', INDENT);
    assert.equal(plan.mode, 'extend');
    const out = applyEdits(docText, plan.edits);
    assert.match(out, /B b,\n\s*CoffeService coffeService\)/);
});

test('extend: constructor with super() gets assignment after it', () => {
    const src = 'public class X extends Y {\n    public X() {\n        super();\n        this.a = a;\n    }\n}\n';
    const { docText, classDecl } = declOf(src);
    const plan = planConstructor(docText, classDecl, { name: 'CoffeService' }, 'coffeService', INDENT);
    assert.equal(plan.mode, 'extend');
    const out = applyEdits(docText, plan.edits);
    const superIdx = out.indexOf('super();');
    const assignIdx = out.indexOf('this.coffeService = coffeService;');
    assert.ok(superIdx !== -1 && assignIdx > superIdx);
});

test('lombok: returns lombok mode when class has constructor-generating annotation', () => {
    const src = '@RequiredArgsConstructor\npublic class X {\n    private final A a;\n}\n';
    const { docText, classDecl } = declOf(src);
    const plan = planConstructor(docText, classDecl, { name: 'CoffeService' }, 'coffeService', INDENT);
    assert.equal(plan.mode, 'lombok');
    assert.equal(plan.lombok, true);
});

test('already: detects dependency already in constructor', () => {
    const src = 'public class X {\n    public X(CoffeService coffeService) {\n    }\n}\n';
    const { docText, classDecl } = declOf(src);
    const plan = planConstructor(docText, classDecl, { name: 'CoffeService' }, 'coffeService', INDENT);
    assert.equal(plan.mode, 'already');
    assert.equal(plan.alreadyInjected, true);
});

test('create: picks @Autowired constructor when several exist', () => {
    const src = 'public class X {\n    public X() {}\n    @Autowired\n    public X(A a) {\n        this.a = a;\n    }\n}\n';
    const { docText, classDecl } = declOf(src);
    const plan = planConstructor(docText, classDecl, { name: 'CoffeService' }, 'coffeService', INDENT);
    assert.equal(plan.mode, 'extend');
    const out = applyEdits(docText, plan.edits);
    assert.match(out, /@Autowired\n\s*public X\(A a, CoffeService coffeService\)/);
});
