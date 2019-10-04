/* @flow */

/**
 * Expand input[v-model] with dyanmic type bindings into v-if-else chains
 * Turn this:
 *   <input v-model="data[type]" :type="type">
 * into this:
 *   <input v-if="type === 'checkbox'" type="checkbox" v-model="data[type]">
 *   <input v-else-if="type === 'radio'" type="radio" v-model="data[type]">
 *   <input v-else :type="type" v-model="data[type]">
 */

import {
  addRawAttr,
  getBindingAttr,
  getAndRemoveAttr
} from 'compiler/helpers'

import {
  processFor,
  processElement,
  addIfCondition,
  createASTElement
} from 'compiler/parser/index'

function preTransformNode (el: ASTElement, options: CompilerOptions) {
  if (el.tag === 'input') {
    const map = el.attrsMap
    // map里面没有，说明该标签没有定义v-model属性
    if (!map['v-model']) {
      return
    }

    let typeBinding
    // 获取解析过后的属性
    if (map[':type'] || map['v-bind:type']) {
      // 返回值格式 string || _f(name)(_f(name)(exp, args))
      typeBinding = getBindingAttr(el, 'type')
    }
    if (!map.type && !typeBinding && map['v-bind']) {
      typeBinding = `(${map['v-bind']}).type`
    }

    if (typeBinding) {
      // 获取到v-if的值
      const ifCondition = getAndRemoveAttr(el, 'v-if', true)
      // 拼接v-if字符串
      const ifConditionExtra = ifCondition ? `&&(${ifCondition})` : ``
      // 判断是否存在v-else
      const hasElse = getAndRemoveAttr(el, 'v-else', true) != null
      // 获取v-else-if的值
      const elseIfCondition = getAndRemoveAttr(el, 'v-else-if', true)
      // 1. checkbox
      // clone一份ast节点
      const branch0 = cloneASTElement(el)
      // process for on the main node
      // 处理v-for => {for: xx, alias: xx, iterator1?: xx, iterator2?:xx}
      processFor(branch0)
      // 添加一个{name: type ,value: checkbox}属性
      addRawAttr(branch0, 'type', 'checkbox')
      // 处理key、slot、属性等
      processElement(branch0, options)
      branch0.processed = true // prevent it from double-processed
      branch0.if = `(${typeBinding})==='checkbox'` + ifConditionExtra
      addIfCondition(branch0, {
        exp: branch0.if,
        block: branch0
      })
      // 2. add radio else-if condition
      const branch1 = cloneASTElement(el)
      getAndRemoveAttr(branch1, 'v-for', true)
      addRawAttr(branch1, 'type', 'radio')
      processElement(branch1, options)
      addIfCondition(branch0, {
        exp: `(${typeBinding})==='radio'` + ifConditionExtra,
        block: branch1
      })
      // 3. other
      const branch2 = cloneASTElement(el)
      getAndRemoveAttr(branch2, 'v-for', true)
      addRawAttr(branch2, ':type', typeBinding)
      processElement(branch2, options)
      addIfCondition(branch0, {
        exp: ifCondition,
        block: branch2
      })

      if (hasElse) {
        branch0.else = true
      } else if (elseIfCondition) {
        branch0.elseif = elseIfCondition
      }

      return branch0
    }
  }
}

function cloneASTElement (el) {
  return createASTElement(el.tag, el.attrsList.slice(), el.parent)
}

export default {
  preTransformNode
}
