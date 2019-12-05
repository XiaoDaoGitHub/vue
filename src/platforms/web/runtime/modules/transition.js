/* @flow */

import { inBrowser, isIE9, warn } from 'core/util/index'
import { mergeVNodeHook } from 'core/vdom/helpers/index'
import { activeInstance } from 'core/instance/lifecycle'

import {
  once,
  isDef,
  isUndef,
  isObject,
  toNumber
} from 'shared/util'

import {
  nextFrame,
  resolveTransition,
  whenTransitionEnds,
  addTransitionClass,
  removeTransitionClass
} from '../transition-util'

export function enter (vnode: VNodeWithData, toggleDisplay: ?() => void) {
  // 获取真实的dom元素
  const el: any = vnode.elm

  // call leave callback now
  // 是否leave状态切换过来的，执行回调函数清除class
  if (isDef(el._leaveCb)) {
    el._leaveCb.cancelled = true
    el._leaveCb()
  }
  // vnode.data.transition在transition的render函数里面设置的，
  // 会把transition组件的属性和事件提取到这上面来
  // resolveTransition会把css过渡的各种类名以及vnode.data.transition的属性继承出来
  const data = resolveTransition(vnode.data.transition)
  if (isUndef(data)) {
    return
  }

  /* istanbul ignore if */
  // el_enterCb表示正在过渡中 
  if (isDef(el._enterCb) || el.nodeType !== 1) {
    return
  }

  const {
    css,
    type,
    enterClass,
    enterToClass,
    enterActiveClass,
    appearClass,
    appearToClass,
    appearActiveClass,
    beforeEnter,
    enter,
    afterEnter,
    enterCancelled,
    beforeAppear,
    appear,
    afterAppear,
    appearCancelled,
    duration
  } = data

  // activeInstance will always be the <transition> component managing this
  // transition. One edge case to check is when the <transition> is placed
  // as the root node of a child component. In that case we need to check
  // <transition>'s parent for appear check.
  // 获取到当前的vnode实例
  let context = activeInstance
  let transitionNode = activeInstance.$vnode
  // 只有根vnode才有parent，对临界情况做处理
  // 防止多个transtion组件进行嵌套
  while (transitionNode && transitionNode.parent) {
    context = transitionNode.context
    transitionNode = transitionNode.parent
  }
  /// 是否处于还未mounted，或者未插入到dom中
  const isAppear = !context._isMounted || !vnode.isRootInsert
  // 处于渲染中并且没有传入appear，直接返回，第一次渲染不进行动画
  if (isAppear && !appear && appear !== '') {
    return
  }
  // 为各个阶段配置要转换的class
  const startClass = isAppear && appearClass
    ? appearClass
    : enterClass
  const activeClass = isAppear && appearActiveClass
    ? appearActiveClass
    : enterActiveClass
  const toClass = isAppear && appearToClass
    ? appearToClass
    : enterToClass

  const beforeEnterHook = isAppear
    ? (beforeAppear || beforeEnter)
    : beforeEnter
  const enterHook = isAppear
    ? (typeof appear === 'function' ? appear : enter)
    : enter
  const afterEnterHook = isAppear
    ? (afterAppear || afterEnter)
    : afterEnter
  const enterCancelledHook = isAppear
    ? (appearCancelled || enterCancelled)
    : enterCancelled
  // 对定义的duration做转换为数字类型
  const explicitEnterDuration: any = toNumber(
    isObject(duration)
      ? duration.enter
      : duration
  )

  if (process.env.NODE_ENV !== 'production' && explicitEnterDuration != null) {
    checkDuration(explicitEnterDuration, 'enter', vnode)
  }
  // 是否启动css动画
  const expectsCSS = css !== false && !isIE9
  // 是否传入了js函数手动控制
  const userWantsControl = getHookArgumentsLength(enterHook)
  // once是单例模式的一个实现
  // _enterCb会在进入动画enter阶段执行，
  const cb = el._enterCb = once(() => {
    // 期望的是css动画的话，移除进入过渡的class以及activeClass
    if (expectsCSS) {
      removeTransitionClass(el, toClass)
      removeTransitionClass(el, activeClass)
    }
    // 
    if (cb.cancelled) {
      if (expectsCSS) {
        removeTransitionClass(el, startClass)
      }
      enterCancelledHook && enterCancelledHook(el)
    } else {
      // 执行afterenterhook
      afterEnterHook && afterEnterHook(el)
    }
    // _enterCb只执行一次
    el._enterCb = null
  })
  // 不是v-show属性
  if (!vnode.data.show) {
    // remove pending leave element on enter by injecting an insert hook
    // 合并一个insert钩子函数，在elm插入后执行，
    mergeVNodeHook(vnode, 'insert', () => {
      const parent = el.parentNode
      const pendingNode = parent && parent._pending && parent._pending[vnode.key]
      if (pendingNode &&
        pendingNode.tag === vnode.tag &&
        pendingNode.elm._leaveCb
      ) {
        pendingNode.elm._leaveCb()
      }
      enterHook && enterHook(el, cb)
    })
  }

  // start enter transition
  // 定义了beforeEnter钩子，调用一遍
  beforeEnterHook && beforeEnterHook(el)
  // 支持css动画
  if (expectsCSS) {
    // 添加statClass和activeClass
    addTransitionClass(el, startClass)
    addTransitionClass(el, activeClass)
    // nextFrame是requestAnimtionFrame
    nextFrame(() => {
      // 下一帧移除startClass
      removeTransitionClass(el, startClass)
      // 没有被删除
      if (!cb.cancelled) {
        // 添加enterToClass，开始过渡
        addTransitionClass(el, toClass)
        if (!userWantsControl) {
          // 如果传入了duration，则会在duration后调用cb
          if (isValidDuration(explicitEnterDuration)) {
            setTimeout(cb, explicitEnterDuration)
          } else {
            // 监听transtionEnd事件
            whenTransitionEnds(el, type, cb)
          }
        }
      }
    })
  }

  if (vnode.data.show) {
    toggleDisplay && toggleDisplay()
    enterHook && enterHook(el, cb)
  }

  if (!expectsCSS && !userWantsControl) {
    cb()
  }
}

export function leave (vnode: VNodeWithData, rm: Function) {
  // 获取真实dom节点
  const el: any = vnode.elm

  // call enter callback now
  if (isDef(el._enterCb)) {
    // 标记动画进入离开阶段
    el._enterCb.cancelled = true
    // 执行enter阶段的回调函数,清除对应的class
    el._enterCb()
  }
  // 获取transition组件的属性和事件以及各种运行时的class名称
  const data = resolveTransition(vnode.data.transition)
  if (isUndef(data) || el.nodeType !== 1) {
    return rm()
  }

  /* istanbul ignore if */
  // 正处于离开过渡阶段，直接返回，防止重复执行
  if (isDef(el._leaveCb)) {
    return
  }

  const {
    css,
    type,
    leaveClass,
    leaveToClass,
    leaveActiveClass,
    beforeLeave,
    leave,
    afterLeave,
    leaveCancelled,
    delayLeave,
    duration
  } = data
  // 是否支持css动画
  const expectsCSS = css !== false && !isIE9
  // 用户是否自定义了离开动画的钩子函数
  const userWantsControl = getHookArgumentsLength(leave)
  // 是否传入了duration时间间隔
  const explicitLeaveDuration: any = toNumber(
    isObject(duration)
      ? duration.leave
      : duration
  )

  if (process.env.NODE_ENV !== 'production' && isDef(explicitLeaveDuration)) {
    checkDuration(explicitLeaveDuration, 'leave', vnode)
  }
  // 定义离开都的回调函数
  const cb = el._leaveCb = once(() => {
    if (el.parentNode && el.parentNode._pending) {
      el.parentNode._pending[vnode.key] = null
    }
    if (expectsCSS) {
      removeTransitionClass(el, leaveToClass)
      removeTransitionClass(el, leaveActiveClass)
    }
    if (cb.cancelled) {
      if (expectsCSS) {
        removeTransitionClass(el, leaveClass)
      }
      leaveCancelled && leaveCancelled(el)
    } else {
      rm()
      afterLeave && afterLeave(el)
    }
    el._leaveCb = null
  })

  if (delayLeave) {
    delayLeave(performLeave)
  } else {
    performLeave()
  }

  function performLeave () {
    // the delayed leave may have already been cancelled
    // 以及删除了，就直接返回
    if (cb.cancelled) {
      return
    }
    // record leaving element
    if (!vnode.data.show && el.parentNode) {
      (el.parentNode._pending || (el.parentNode._pending = {}))[(vnode.key: any)] = vnode
    }
    // 提供了beforeLeave函数
    beforeLeave && beforeLeave(el)
    if (expectsCSS) {
      // 添加leaveClass以及leaveActiveClass
      addTransitionClass(el, leaveClass)
      addTransitionClass(el, leaveActiveClass)
      // 下一帧执行
      nextFrame(() => {
        // 移除leaveClass
        removeTransitionClass(el, leaveClass)
        if (!cb.cancelled) {
          // 添加过渡class
          addTransitionClass(el, leaveToClass)
          // 用户没有传入钩子函数
          if (!userWantsControl) {
            // 是否出传入了duration
            if (isValidDuration(explicitLeaveDuration)) {
              setTimeout(cb, explicitLeaveDuration)
            } else {
              // 监听transtionend事件，移除相应的class
              whenTransitionEnds(el, type, cb)
            }
          }
        }
      })
    }
    leave && leave(el, cb)
    if (!expectsCSS && !userWantsControl) {
      cb()
    }
  }
}

// only used in dev mode
function checkDuration (val, name, vnode) {
  if (typeof val !== 'number') {
    warn(
      `<transition> explicit ${name} duration is not a valid number - ` +
      `got ${JSON.stringify(val)}.`,
      vnode.context
    )
  } else if (isNaN(val)) {
    warn(
      `<transition> explicit ${name} duration is NaN - ` +
      'the duration expression might be incorrect.',
      vnode.context
    )
  }
}

function isValidDuration (val) {
  return typeof val === 'number' && !isNaN(val)
}

/**
 * Normalize a transition hook's argument length. The hook may be:
 * - a merged hook (invoker) with the original in .fns
 * - a wrapped component method (check ._length)
 * - a plain function (.length)
 */
function getHookArgumentsLength (fn: Function): boolean {
  // fn是函数的话，则表明用户想要手动操控动画
  if (isUndef(fn)) {
    return false
  }
  const invokerFns = fn.fns
  if (isDef(invokerFns)) {
    // invoker
    return getHookArgumentsLength(
      Array.isArray(invokerFns)
        ? invokerFns[0]
        : invokerFns
    )
  } else {
    return (fn._length || fn.length) > 1
  }
}

function _enter (_: any, vnode: VNodeWithData) {
  // 对于v-show，有特需的处理逻辑
  if (vnode.data.show !== true) {
    enter(vnode)
  }
}

export default inBrowser ? {
  // 会在create的时候调用create钩子
  create: _enter,
  activate: _enter,
  remove (vnode: VNode, rm: Function) {
    /* istanbul ignore else */
    if (vnode.data.show !== true) {
      leave(vnode, rm)
    } else {
      rm()
    }
  }
} : {}
