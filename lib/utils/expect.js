import expect from 'expect'
import snapshot from 'jest-snapshot'
import { basename, dirname } from 'path'

const { SnapshotState, toMatchSnapshot } = snapshot

export const createExpect = scope => {
    return function (_actual) {
        const snapshotFile = `${dirname(scope[0])}/__SNAPSHOTS__/${basename(
            scope[0],
        )}.snapshot`

        const called = expect(_actual)
        
        called.toMatchSnapshot = (
            hint,
            testFile = snapshotFile,
            testTitle = scope.slice(-1),
        ) => {
            const snapshotState = new SnapshotState(testFile, {
                updateSnapshot: process.env.SNAPSHOT_UPDATE ? 'all' : 'new',
                prettierPath: null,
                snapshotFormat: null,
            })

            const context = {
                snapshotState,
                currentTestName: testTitle,
            }

            const matcher = toMatchSnapshot.bind(context)
            const args = [_actual, hint].filter(Boolean)
            const result = matcher(...args)
            
            assert(result.pass)

            snapshotState.save()
        }

        return called
    }
}