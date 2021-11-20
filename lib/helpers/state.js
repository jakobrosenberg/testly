
/**
 * @typedef {Object} ReporterCtx
 * @prop {Scope=} scope
 * @prop {Error=} err
 * @prop {Status=} status
 */

/**
 * @template T
 * @typedef {ReporterCtx & T} EnhancedReporterCtx
 */

/**
 * @typedef {ReporterCtx & {rootTestState: TestState, testState: TestState}} StateProxyCtx
 */

/**
 * @callback Reporter
 * @prop {Reporter} ctx
 */

/**
 * @template C
 * @callback ReporterCallback
 * @param {C} ctx
 * @param {...any} params
 */

/**
 * @template T
 * @typedef {Object} ReporterCollection
 * @prop {ReporterCallback<EnhancedReporterCtx<T>>} addedFile
 * @prop {ReporterCallback<EnhancedReporterCtx<T>>} openedFile
 * @prop {ReporterCallback<EnhancedReporterCtx<T>>} closedFile
 * @prop {ReporterCallback<EnhancedReporterCtx<T>>} addedTest
 * @prop {ReporterCallback<EnhancedReporterCtx<T>>} startedTest
 * @prop {ReporterCallback<{scope: Scope, status: Status, err: Error} & T>} finishedTest
 * @prop {ReporterCallback<EnhancedReporterCtx<T>>} finishedAllTests
 */

/**
 * testStateManager returns a proxy that can be wrapped around a reporter
 * to populate ctx with testState and rootTestState
 * @example
 * export const ConsoleReporter = (options = {}) =>
    stateProxy({
        closedFile: ctx => printTest(ctx.testState, options),
        finishedAllTests: () => { console.timeEnd('total') },
    })
 */
export const createTestStateManager = () => {
    const rootTestState = new TestState()

    const getStateNodeByScope = scope =>
        scope.reduce((testState, name) => testState.children[name], rootTestState)

    const addTestState = ({ scope }) => {
        const parentScope = [...scope]
        const name = parentScope.pop()
        const parent = getStateNodeByScope(parentScope)
        return new TestState({ scope, parent, name })
    }


    const events = {
        addedTest: addTestState,
        addedFile: addTestState,
        finishedTest: params => getStateNodeByScope(params.scope).finished(params),
        startedTest: ({ scope }) => getStateNodeByScope(scope).started(),
        openedFile: ({ scope }) => getStateNodeByScope(scope).started(),
        closedFile: ({ scope }) => getStateNodeByScope(scope).finished(),
        finishedAllTests: () => { rootTestState.ownState = 'finished' },
    }



    /**
     * @param {Partial<ReporterCollection<{rootTestState: TestState, testState: TestState}>>} target
     */
    const stateProxy = target => new Proxy(target, {
        get: (target, _prop) => {
            const prop = /** @type {string} */ (_prop)
            return (ctx, ...params) => {
                if (events[prop]) events[prop](ctx, ...params)
                Object.assign(ctx, {
                    rootTestState,
                    testState: ctx.scope && getStateNodeByScope(ctx.scope)
                })

                const fn = target[prop] || target.catch
                if (fn) fn(ctx, ...params)
            }
        },
    })
    return { events, rootTestState, getStateNodeByScope, stateProxy }
}

export class TestState {
    /** @type {Status} */
    ownStatus = null
    /** @type {Error} */
    err = null
    /** @type {Date} */
    startedAt = null
    /** @type {Date} */
    finishedAt = null
    /** @type {Object.<string, TestState>} */
    children = {}
    /** @type {TestState} */
    #parent = null


    /**
     * @param {{scope: Scope, parent: TestState, name: string}=} ctx
     */
    constructor(ctx) {
        /** @type {State} */
        this.ownState = 'pending'

        if (!ctx)
            return this

        const { scope, parent, name } = ctx
        this.name = name
        this.scope = scope
        this.#parent = parent
        this.#parent.children[name] = this
    }

    get parent() { return this.#parent }

    get level() { return this.scope?.length }

    get isFile() { return this.level === 1 }

    get hasChildren() { return !!Object.values(this.children).length }

    get duration() { return this.finishedAt?.getTime() - this.startedAt?.getTime() }

    /** @returns {State[]} */
    get nestedStates() { return Object.values(this.children).map(c => [c.ownState, ...c.nestedStates]).flat() }

    /** @returns {Status[]} */
    get nestedStatuses() { return Object.values(this.children).map(c => [c.ownStatus, ...c.nestedStatuses]).flat() }

    /** @returns {Status} */
    get status() {
        /** @type {Status[]} */
        const statusMap = ['fail', 'pass', 'skipped']
        return [this.ownStatus, ...this.nestedStatuses]
            .filter(Boolean)
            .sort((a, b) => statusMap.indexOf(a) - statusMap.indexOf(b))
            .shift()
    }

    /** @returns {State} */
    get state() {
        const states = [this.ownState, ...this.nestedStates]
        return states.every(state => state === states[0]) ? states[0] : 'started'
    }


    started() {
        this.startedAt = new Date()
        this.ownState = 'started'
    }

    finished(ctx) {
        this.ownState = 'finished'
        this.finishedAt = new Date()

        if (ctx) {
            this.ownStatus = ctx.ownStatus
            this.err = ctx.err
        }
    }

    toJSON() {
        const skip = ['constructor', 'parent']
        return Reflect.ownKeys(TestState.prototype).reduce((obj, key) => {
            if (!skip.includes(/**@type {string}*/(key)))
                obj[key] = this[key] || obj[key]
            return obj
        }, {...this})
    }
}