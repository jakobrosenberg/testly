import { existsSync } from 'fs'
import { createParallelHooksCollection } from 'hookar'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

export const createDirname = meta => dirname(fileURLToPath(meta.url))

export const resolveConfig = async options => {
    const { configPath } = options
    const rootConfigPromise = getRootConfig(configPath)
    options.scopedConfigs = options.scopedConfigs || []
    const scopedConfigPromises = options.scopedConfigs.map(path =>
        import(path).then(r => r.default),
    )
    const configs = await Promise.all([rootConfigPromise, ...scopedConfigPromises])
    return configs.reduce((config, subConfig) => ({ ...config, ...subConfig }), options)
}

const getRootConfig = async configPath => {
    try {
        if (configPath)
            return import('file:///' + resolve(configPath)).then(r => r.default)
        try {
            return await import('file:///' + process.cwd() + '/probs.config.js').then(
                r => r.default,
            )
        } catch (_err) {
            if (_err.code === 'ERR_MODULE_NOT_FOUND') return {}
            throw _err
        }
    } catch (err) {
        console.log(`failed to import config: "${configPath}"`)
        throw err
    }
}

export const createHooksCollection = () => ({
    beforeAll: createParallelHooksCollection(),
    afterAll: createParallelHooksCollection(),
    beforeEach: createParallelHooksCollection(),
    afterEach: createParallelHooksCollection(),
})

/**
 * @param {'atCreate'|'atCall'} queueTime
 */
export const createQueuedFunctionWrapper = queueTime => {
    /**
     * @type {{cb: function, resolve: function, reject: function}[]}
     */
    const queue = []
    let running
    const processQueue = async () => {
        if (!running && queue.length && queue[0].cb) {
            running = true
            const nextItem = queue.shift()
            try {
                const result = await nextItem.cb()
                nextItem.resolve(result)
            } catch (err) {
                nextItem.reject(err)
            }
            running = false
            processQueue()
        }
    }

    /**
     * Wraps a function in a queue runner. When the function is created (or called), it gets pushed to the queue.
     * @template {function} T
     * @param {T} cb
     * @returns {T}
     */
    const queueFunction = cb => {
        const queuedFn = {
            cb: null,
            resolve: null,
            reject: null,
        }

        if (queueTime === 'atCreate') queue.push(queuedFn)

        const queuedFunction = async (...params) => {
            return new Promise((resolve, reject) => {
                queuedFn.cb = () => cb(...params)
                queuedFn.cb.toString = cb.toString.bind(cb)
                queuedFn.resolve = resolve
                queuedFn.reject = reject
                if (queueTime === 'atCall') queue.push(queuedFn)
                processQueue()
            })
        }
        // @ts-ignore
        return queuedFunction
    }

    queueFunction.queue = queue
    return queueFunction
}

export const capitalize = str => str.charAt(0).toUpperCase() + str.slice(1)

/**
 * Wraps a promise and rejects it if the time runs out
 * @template T
 * @template {Promise<T> | T} P
 * @param {P} promise
 * @param {number | string} time
 * @param {string | Error =} error
 * @returns {P}
 */
export const addTimeoutToPromise = (promise, time, error) => {
    // if input isn't a promise, return it
    if (!(promise instanceof Promise)) return promise

    return /** @type {P} */ (
        new Promise((resolve, reject) => {
            const timeoutHandle = setTimeout(
                () => reject(error || new Error(`timed out (${time} ms)`)),
                Number(time),
            )

            promise
                .then(resolve)
                .catch(reject)
                // let's not keep things hanging for an unused timeout
                .finally(() => clearTimeout(timeoutHandle))
        })
    )
}

export const fileFromScope = scope => {
    const relativePath = scope[0]
    return {
        relativePath,
        path: resolve(relativePath),
        relativeDir: dirname(relativePath),
        dir: resolve(dirname(relativePath)),
    }
}

/**
 * @param {string} path
 * @param {boolean=} require throw error if path is not found
 */
export const importCfg = async (path, require) => {
    const fullpath = resolve(path)

    if (existsSync(fullpath)) {
        const cfg = await import(`file:///${fullpath}`).then(r => r.default)
        if (typeof cfg === 'function') return await cfg()
        else if (typeof cfg === 'object') return cfg
        else {
            const message = `config file "${fullpath}" did not return an object or a function`
            const err = new Error(message)
            err.name = 'ParseError'
            throw err
        }
    } else if (require) {
       const err = new Error(`Cannot find file: "${path}"`)
       err['code'] = 'ERR_MODULE_NOT_FOUND'
       throw err
    }
}

export const importParentCfgs = async (path, cfgName = 'probs.config.js') => {
    // get all accumulated ancestor directories of path, eg. ['a/b/c', 'a/b', 'a', '']
    const pathAncestors = dirname(path)
        .split(/[\\/]/) // split by path separator
        .map((_, i, arr) => arr.slice(0, i + 1).join('/')) // join by path separator
        .map(path => `${path}/${cfgName}`) // add filename

    // import all ancestor configs
    const cfgs = await Promise.all(pathAncestors.map(p => importCfg(p)))
    return cfgs.reduce((cfg, subCfg) => ({ ...cfg, ...subCfg }), {})
}
