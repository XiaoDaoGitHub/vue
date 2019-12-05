/* @flow */

// Provides transition support for a single element/component.
// supports transition mode (out-in / in-out)

import { warn } from 'core/util/index'
import { camelize, extend, isPrimitive } from 'shared/util'
import {
  mergeVNodeHook,
  isAsyncPlaceholder,
  getFirstComponentChild
} from 'core/vdom/helpers/index'

export const transitionProps = {
  name: String,
  appear: Boolean,
  css: Boolean,
  mode: String,
  type: String,
  enterClass: String,
  leaveClass: String,
  enterToClass: String,
  leaveToClass: String,
  enterActiveClass: String,
  leaveActiveClass: String,
  appearClass: String,
  appearActiveClass: String,
  appearToClass: String,
  duration: [Number, String, Object]
}

// in case the child is also an abstract component, e.g. <keep-alive>
// we want to recursively retrieve the real component to be rendered
function getRealChild (vnode: ?VNode): ?VNode {
  const compOptions: ?VNodeComponentOptions = vnode && vnode.componentOptions
  if (compOptions && compOptions.Ctor.options.abstract) {
    return getRealChild(getFirstComponentChild(compOptions.children))
  } else {
    return vnode
  }
}

export function extractTransitionData (comp: Component): Object {
  const data = {}
  const options: ComponentOptions = comp.$options
  // props
  // 获取transition的熟悉
  for (const key in options.propsData) {
    data[key] = comp[key]
  }
  // events.
  // extract listeners and pass them directly to the transition methods
  const listeners: ?Object = options._parentListeners
  // 获取transiton的事件
  for (const key in listeners) {
    data[camelize(key)] = listeners[key]
  }
  return data
}

function placeholder (h: Function, rawChild: VNode): ?VNode {
  if (/\d-keep-alive$/.test(rawChild.tag)) {
    return h('keep-alive', {
      props: rawChild.componentOptions.propsData
    })
  }
}

function hasParentTransition (vnode: VNode): ?boolean {
  while ((vnode = vnode.parent)) {
    if (vnode.data.transition) {
      return true
    }
  }
}

function isSameChild (child: VNode, oldChild: VNode): boolean {
  return oldChild.key === child.key && oldChild.tag === child.tag
}

const isNotTextNode = (c: VNode) => c.tag || isAsyncPlaceholder(c)

const isVShowDirective = d => d.name === 'show'

export default {
  name: 'transition',
  props: transitionProps,
  // transition和keep-alive一样都是抽象组件
  abstract: true,

  render (h: Function) {
    // 获取子节点
    let children: any = this.$slots.default
    // 
    if (!children) {
      return
    }

    // filter out text nodes (possible whitespaces)
    // 不能是文本节点
    children = children.filter(isNotTextNode)
    /* istanbul ignore if */
    // 没有子节点的话直接返回
    if (!children.length) {
      return
    }

    // warn multiple elements
    if (process.env.NODE_ENV !== 'production' && children.length > 1) {
      warn(
        '<transition> can only be used on a single element. Use ' +
        '<transition-group> for lists.',
        this.$parent
      )
    }

    const mode: string = this.mode

    // warn invalid mode
    if (process.env.NODE_ENV !== 'production' &&
      mode && mode !== 'in-out' && mode !== 'out-in'
    ) {
      warn(
        'invalid <transition> mode: ' + mode,
        this.$parent
      )
    }
    // 获取第一个子节点
    const rawChild: VNode = children[0]

    // if this is a component root node and the component's
    // parent container node also has transition, skip.
    // 看当前节点的父节点是否也是transition节点，是的话返回rawChild
    if (hasParentTransition(this.$vnode)) {
      return rawChild
    }

    // apply transition data to child
    // use getRealChild() to ignore abstract components e.g. keep-alive
    // 子节点不能是抽象节点，获取真实的vnode节点
    const child: ?VNode = getRealChild(rawChild)
    /* istanbul ignore if */
    if (!child) {
      return rawChild
    }

    if (this._leaving) {
      return placeholder(h, rawChild)
    }

    // ensure a key that is unique to the vnode type and to this transition
    // component instance. This key will be used to remove pending leaving nodes
    // during entering.
    // 构建id
    const id: string = `__transition-${this._uid}-`
    // 设置子节点的key
    child.key = child.key == null
      ? child.isComment
        ? id + 'comment'
        : id + child.tag
      : isPrimitive(child.key)
        ? (String(child.key).indexOf(id) === 0 ? child.key : id + child.key)
        : child.key
    // 提取transition的属性和事件
    const data: Object = (child.data || (child.data = {})).transition = extractTransitionData(this)
    // 获取上一次渲染的vnode
    const oldRawChild: VNode = this._vnode
    // 获取上一次渲染的真实节点
    const oldChild: VNode = getRealChild(oldRawChild)

    // mark v-show
    // so that the transition module can hand over the control to the directive
    // transition子节点是否有v-show指令
    if (child.data.directives && child.data.directives.some(isVShowDirective)) {
      // 标记data.show = true
      child.data.show = true
    }

    if (
      oldChild &&
      oldChild.data &&
      // 新旧vnode不是相同类型的vnode
      !isSameChild(child, oldChild) &&
      // oldChild不是异步占位符节点
      !isAsyncPlaceholder(oldChild) &&
      // #6687 component root is a comment node
      // oldChild不是一个注释节点
      !(oldChild.componentInstance && oldChild.componentInstance._vnode.isComment)
    ) {
      // replace old child transition data with fresh one
      // important for dynamic transitions!
      // 继承child的属性和事件
      const oldData: Object = oldChild.data.transition = extend({}, data)
      // handle transition mode
      // 是否是out-in模式(老元素先过渡，新元素后过渡)
      if (mode === 'out-in') {
        // return placeholder node and queue update when leave finishes
        this._leaving = true
        mergeVNodeHook(oldData, 'afterLeave', () => {
          this._leaving = false
          this.$forceUpdate()
        })
        return placeholder(h, rawChild)
      } else if (mode === 'in-out') {
        if (isAsyncPlaceholder(child)) {
          return oldRawChild
        }
        let delayedLeave
        const performLeave = () => { delayedLeave() }
        mergeVNodeHook(data, 'afterEnter', performLeave)
        mergeVNodeHook(data, 'enterCancelled', performLeave)
        mergeVNodeHook(oldData, 'delayLeave', leave => { delayedLeave = leave })
      }
    }

    return rawChild
  }
}
