/* @flow */

// Provides transition support for list items.
// supports move transitions using the FLIP technique.

// Because the vdom's children update algorithm is "unstable" - i.e.
// it doesn't guarantee the relative positioning of removed elements,
// we force transition-group to update its children into two passes:
// in the first pass, we remove all nodes that need to be removed,
// triggering their leaving transition; in the second pass, we insert/move
// into the final desired state. This way in the second pass removed
// nodes will remain where they should be.

import { warn, extend } from 'core/util/index'
import { addClass, removeClass } from '../class-util'
import { transitionProps, extractTransitionData } from './transition'
import { setActiveInstance } from 'core/instance/lifecycle'

import {
  hasTransition,
  getTransitionInfo,
  transitionEndEvent,
  addTransitionClass,
  removeTransitionClass
} from '../transition-util'
// transitonGroup的属性会继承transition组件
const props = extend({
  tag: String,
  moveClass: String
}, transitionProps)

delete props.mode

export default {
  props,

  beforeMount () {
    const update = this._update
    this._update = (vnode, hydrating) => {
      const restoreActiveInstance = setActiveInstance(this)
      // force removing pass
      this.__patch__(
        this._vnode,
        this.kept,
        false, // hydrating
        true // removeOnly (!important, avoids unnecessary moves)
      )
      this._vnode = this.kept
      restoreActiveInstance()
      update.call(this, vnode, hydrating)
    }
  },

  render (h: Function) {
    // transitionGroup会渲染成一个真实的节点，模式是span标签
    const tag: string = this.tag || this.$vnode.data.tag || 'span'
    const map: Object = Object.create(null)
    // 获取上一次渲染的子节点，因为消失的子节点也可以出发离开动画
    const prevChildren: Array<VNode> = this.prevChildren = this.children
    // 获取当前的默认插槽内容
    const rawChildren: Array<VNode> = this.$slots.default || []
    // 重新设置当前children为空数组
    const children: Array<VNode> = this.children = []
    // 提取transitionGroup的属性和事件
    const transitionData: Object = extractTransitionData(this)
    // 遍历当前所有的children
    for (let i = 0; i < rawChildren.length; i++) {
      const c: VNode = rawChildren[i]
      // 子节点是标签
      if (c.tag) {
        // key如果包含vlist，则是通过v-for渲染出来的列表
        if (c.key != null && String(c.key).indexOf('__vlist') !== 0) {
          // 子节点存放当前节点
          children.push(c)
          // 通过key缓存节点
          map[c.key] = c
          // 每一个子节点都继承transtionGroup的属性和事件
          ;(c.data || (c.data = {})).transition = transitionData
        } else if (process.env.NODE_ENV !== 'production') {
          const opts: ?VNodeComponentOptions = c.componentOptions
          const name: string = opts ? (opts.Ctor.options.name || opts.tag || '') : c.tag
          warn(`<transition-group> children must be keyed: <${name}>`)
        }
      }
    }
    // 非首次渲染，也就意味着可能新增或者删除了元素
    if (prevChildren) {
      const kept: Array<VNode> = []
      const removed: Array<VNode> = []
      // 循环前一次的子节点
      for (let i = 0; i < prevChildren.length; i++) {
        const c: VNode = prevChildren[i]
        // 给之前每一个节点也存入transitionData属性
        c.data.transition = transitionData
        // 获取到每一个子节点的位置
        c.data.pos = c.elm.getBoundingClientRect()
        // 前一次渲染的节点是否还存在
        if (map[c.key]) {
          kept.push(c)
        } else {
          removed.push(c)
        }
      }
      this.kept = h(tag, null, kept)
      this.removed = removed
    }

    return h(tag, null, children)
  },

  updated () {
    // 获取之前的children
    const children: Array<VNode> = this.prevChildren
    // 拼接移动的元素类名
    const moveClass: string = this.moveClass || ((this.name || 'v') + '-move')
    // hasMove，分析moveClass是否定义了css动画，没有的话直接返回
    if (!children.length || !this.hasMove(children[0].elm, moveClass)) {
      return
    }

    // we divide the work into three loops to avoid mixing DOM reads and writes
    // in each iteration - which helps prevent layout thrashing.
    // 执行move，enter的回调函数
    children.forEach(callPendingCbs)
    // 每一个子节点记录当前的位置
    children.forEach(recordPosition)
    // 设置新旧位置的偏移距离
    children.forEach(applyTranslation)

    // force reflow to put everything in position
    // assign to this to avoid being removed in tree-shaking
    // $flow-disable-line
    // 强制浏览器重绘，让applyTranslation生效
    this._reflow = document.body.offsetHeight

    children.forEach((c: VNode) => {
      // 子节点发生了位置变化
      if (c.data.moved) {
        // 获取真实dom元素
        const el: any = c.elm
        // 获取样式
        const s: any = el.style
        // 添加移动的class
        addTransitionClass(el, moveClass)
        // 移除行间样式，让moveClass生效，回到现在的位置
        s.transform = s.WebkitTransform = s.transitionDuration = ''
        el.addEventListener(transitionEndEvent, el._moveCb = function cb (e) {
          if (e && e.target !== el) {
            return
          }
          if (!e || /transform$/.test(e.propertyName)) {
            el.removeEventListener(transitionEndEvent, cb)
            el._moveCb = null
            // 移除class
            removeTransitionClass(el, moveClass)
          }
        })
      }
    })
  },

  methods: {
    hasMove (el: any, moveClass: string): boolean {
      /* istanbul ignore if */
      if (!hasTransition) {
        return false
      }
      /* istanbul ignore if */

      // 防止重复执行
      if (this._hasMove) {
        return this._hasMove
      }
      // Detect whether an element with the move class applied has
      // CSS transitions. Since the element may be inside an entering
      // transition at this very moment, we make a clone of it and remove
      // all other transition classes applied to ensure only the move class
      // is applied.
      // 克隆一个当前的元素
      const clone: HTMLElement = el.cloneNode()
      // 移除_transitionClasses，防止对后面的分析造成干扰
      if (el._transitionClasses) {
        el._transitionClasses.forEach((cls: string) => { removeClass(clone, cls) })
      }
      // 添加moveClass
      addClass(clone, moveClass)
      // 隐藏clone的元素
      clone.style.display = 'none'
      // 添加到dom中去
      this.$el.appendChild(clone)
      // 分析css样式是否支持css动画
      const info: Object = getTransitionInfo(clone)
      // 移除这个元素
      this.$el.removeChild(clone)
      return (this._hasMove = info.hasTransform)
    }
  }
}

function callPendingCbs (c: VNode) {
  /* istanbul ignore if */
  // 执行_moveCb回调函数
  if (c.elm._moveCb) {
    c.elm._moveCb()
  }
  /* istanbul ignore if */
  // 执行enterCb的回调函数
  if (c.elm._enterCb) {
    c.elm._enterCb()
  }
}

function recordPosition (c: VNode) {
  // 记录当前元素的位置
  c.data.newPos = c.elm.getBoundingClientRect()
}

function applyTranslation (c: VNode) {
  // 获取之前的位置
  const oldPos = c.data.pos
  // 获取现在的位置
  const newPos = c.data.newPos
  // 计算x轴偏移距离
  const dx = oldPos.left - newPos.left
  // 计算y轴偏移距离
  const dy = oldPos.top - newPos.top
  // 元素发生了位置移动
  if (dx || dy) {
    // 标记moved为true，表示元素发生移动
    c.data.moved = true
    const s = c.elm.style
    // 设置偏移
    s.transform = s.WebkitTransform = `translate(${dx}px,${dy}px)`
    // 回到初始位置
    s.transitionDuration = '0s'
  }
}
