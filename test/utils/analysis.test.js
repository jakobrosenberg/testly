import { readFileSync } from 'fs'
import { analyzeFile, analyzeStr } from '../../lib/analysis/parse.js'
import { createDirname } from '../util.js'
import { _transform } from '../../lib/testLoader.js'
import { SourceMapConsumer, SourceMapGenerator } from 'source-map'

const __dirname = createDirname(import.meta)

test('can analyze file', async () => {
    const result = await analyzeFile(__dirname + '/test.sample.js')
    assert.equal(result.tests.length, 3)
    assert.deepEqual(result.tests[0].scope, ['foo'])
    assert.deepEqual(result.tests[1].scope, ['foo', 'bar'])
    assert.deepEqual(result.tests[2].scope, ['foo', 'bar', 'baz'])
})

test('can analyze string', async () => {
    const content = readFileSync(__dirname + '/test.sample.js')
    const result = await analyzeStr(content)
    assert.equal(result.tests.length, 3)
})

test('can transform file', async () => {
    const original = readFileSync(__dirname + '/test.sample.js', 'utf-8')

    const { content, sourcemap } = await _transform(original, 'test.sample.js')

    // 3 tests with 6 added lines in each
    const addedLength = 3 * 6
    assert.equal(
        content.split(/\r?\n/).length,
        original.split(/\r?\n/).length + addedLength,
    )

    const consumer = await new SourceMapConsumer(sourcemap.toString())

    assert.deepEqual(consumer.originalPositionFor({ line: 7, column: 10 }), {
        source: 'test.sample.js',
        line: 1,
        column: 19,
        name: null,
    })
})

test('can access variables added by transform', () => {
    // @ts-ignore
    assert.equal(test, PROBS_CONTEXT.nestedTest)
    test('scopes work in nested tests', () => {
        // @ts-ignore
        assert.deepEqual(PROBS_CONTEXT.scope, [
            'test/utils/analysis.test.js',
            'can access variables added by transform',
            'scopes work in nested tests',
        ])
    })
})
