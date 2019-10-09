/* @flow */

import {
  warn,
  once,
  isDef,
  isUndef,
  isTrue,
  isObject,
  hasSymbol,
  isPromise,
  remove
} from 'core/util/index'

import { createEmptyVNode } from 'core/vdom/vnode'
import { currentRenderingInstance } from 'core/instance/render'


function ensureCtor (comp: any, base) {
  // 支持通过commonjs模块打包
  if (
    comp.__esModule ||
    (hasSymbol && comp[Symbol.toStringTag] === 'Module')
  ) {
    comp = comp.default
  }
  // comp可以是一个组件对象，也可以是已经构建好的子组件构造函数
  return isObject(comp)
    ? base.extend(comp)
    : comp
}

export function createAsyncPlaceholder (
  factory: Function,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag: ?string
): VNode {
  const node = createEmptyVNode()
  node.asyncFactory = factory
  node.asyncMeta = { data, context, children, tag }
  return node
}

export function resolveAsyncComponent (
  factory: Function,
  baseCtor: Class<Component>
): Class<Component> | void {
  if (isTrue(factory.error) && isDef(factory.errorComp)) {
    return factory.errorComp
  }
  // 异步组件会把加载完成的结果存放在这
  if (isDef(factory.resolved)) {
    return factory.resolved
  }
  // owner保存当前调用异步组件的实例
  const owner = currentRenderingInstance
  if (owner && isDef(factory.owners) && factory.owners.indexOf(owner) === -1) {
    // already pending
    factory.owners.push(owner)
  }

  if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
    return factory.loadingComp
  }

  if (owner && !isDef(factory.owners)) {
    // 将owner用数组保存，等到异步组件加载完成，可以不止一个组件引用了异步组件
    const owners = factory.owners = [owner]
    // 设置同步标志为true
    let sync = true
    let timerLoading = null
    let timerTimeout = null

    ;(owner: any).$on('hook:destroyed', () => remove(owners, owner))

    const forceRender = (renderCompleted: boolean) => {
      // 会调用每一个vm的$forceUpdate来更新
      // $forceUpdate定义在lifecycle.js中
      // 会调用每个Watcher的update方法强制更新一次
      for (let i = 0, l = owners.length; i < l; i++) {
        (owners[i]: any).$forceUpdate()
      }

      if (renderCompleted) {
        // 更新完成情况owners数组
        owners.length = 0
        if (timerLoading !== null) {
          clearTimeout(timerLoading)
          timerLoading = null
        }
        if (timerTimeout !== null) {
          clearTimeout(timerTimeout)
          timerTimeout = null
        }
      }
    } 
    // once是一个单例模式的函数，只执行当前函数一次
    const resolve = once((res: Object | Class<Component>) => {
      // cache resolved
      // 将返回值构建为继承Vue的构造函数
      factory.resolved = ensureCtor(res, baseCtor)
      // invoke callbacks only if this is not a synchronous resolve
      // (async resolves are shimmed as synchronous during SSR)
      // 处于异步状态执行forceRender
      if (!sync) {
        forceRender(true)
      } else {
        owners.length = 0
      }
    })

    const reject = once(reason => {
      process.env.NODE_ENV !== 'production' && warn(
        `Failed to resolve async component: ${String(factory)}` +
        (reason ? `\nReason: ${reason}` : '')
      )
      if (isDef(factory.errorComp)) {
        factory.error = true
        forceRender(true)
      }
    })
    // 异步组件我们会传入resolve，reject参数
    const res = factory(resolve, reject)
    // 对于promis或者高级异步组件res是Object
    if (isObject(res)) {
      // promise则表示是import()组件
      if (isPromise(res)) {
        // () => Promise
        // 没有resolved则调用promise.then方法将resolve和reject函数传递过去
        if (isUndef(factory.resolved)) {
          res.then(resolve, reject)
        }
      // res.component是promise，则表示res是一个高级异步组件
      } else if (isPromise(res.component)) {
        // 同样调用then方法
        res.component.then(resolve, reject)
        // 如果定义了加载错误的组件，则把错误组件构建为构造函数
        if (isDef(res.error)) {
          factory.errorComp = ensureCtor(res.error, baseCtor)
        }
        // 定义了异步组件加载时使用的组件
        if (isDef(res.loading)) {
          // 构建为构造函数
          factory.loadingComp = ensureCtor(res.loading, baseCtor)
          // 是否定义了延迟加载
          if (res.delay === 0) {
            factory.loading = true
          } else {
            // 通过定时器来加载
            timerLoading = setTimeout(() => {
              timerLoading = null
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                // 设置loadding为true，强制更新Watcher
                factory.loading = true
                forceRender(false)
              }
            }, res.delay || 200)
          }
        }
        // 定义了加载超时时间
        if (isDef(res.timeout)) {
          timerTimeout = setTimeout(() => {
            timerTimeout = null
            if (isUndef(factory.resolved)) {
              reject(
                process.env.NODE_ENV !== 'production'
                  ? `timeout (${res.timeout}ms)`
                  : null
              )
            }
          }, res.timeout)
        }
      }
    }
    // 设置同步为false，开始进入异步方法，第一次会返回undefined
    sync = false
    // return in case resolved synchronously
    // 设置了加载时显示的组件则返回加载组件
    return factory.loading
      ? factory.loadingComp
      : factory.resolved
  }
}
