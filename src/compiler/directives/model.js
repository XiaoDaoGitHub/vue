/* @flow */

/**
 * Cross-platform code generation for component v-model
 */
export function genComponentModel (
  el: ASTElement,
  value: string,
  modifiers: ?ASTModifiers
): ?boolean {
  const { number, trim } = modifiers || {}

  const baseValueExpression = '$$v'
  let valueExpression = baseValueExpression
  if (trim) {
    valueExpression =
      `(typeof ${baseValueExpression} === 'string'` +
      `? ${baseValueExpression}.trim()` +
      `: ${baseValueExpression})`
  }
  if (number) {
    valueExpression = `_n(${valueExpression})`
  }
  const assignment = genAssignmentCode(value, valueExpression)

  el.model = {
    value: `(${value})`,
    expression: JSON.stringify(value),
    callback: `function (${baseValueExpression}) {${assignment}}`
  }
}

/**
 * Cross-platform codegen helper for generating v-model value assignment code.
 */
export function genAssignmentCode (
  value: string,
  assignment: string
): string {
  // 解析value，把对象的key和value分隔开
  const res = parseModel(value)
  // 返回
  if (res.key === null) {
    return `${value}=${assignment}`
  } else {
    return `$set(${res.exp}, ${res.key}, ${assignment})`
  }
}

/**
 * Parse a v-model expression into a base path and a final key segment.
 * Handles both dot-path and possible square brackets.
 *
 * Possible cases:
 *
 * - test
 * - test[key]
 * - test[test1[key]]
 * - test["a"][key]
 * - xxx.test[a[a].test1[key]]
 * - test.xxx.a["asa"][test1[key]]
 *
 */

let len, str, chr, index, expressionPos, expressionEndPos

type ModelParseResult = {
  exp: string,
  key: string | null
}

export function parseModel (val: string): ModelParseResult {
  // Fix https://github.com/vuejs/vue/pull/7730
  // allow v-model="obj.val " (trailing whitespace)
  val = val.trim()
  len = val.length
  // 没有[或者]标签,就直接返回解析值
  if (val.indexOf('[') < 0 || val.lastIndexOf(']') < len - 1) {
    // 搜索.运算符，出现了表示是从对象中获取属性，
    // 从后向前搜索，第一个之前的都是对象，后面的就是属性
    index = val.lastIndexOf('.')
    // 有.运算符，则表达式(对象名称)是. 前面的
    // 而value是.后面的
    if (index > -1) {
      return {
        exp: val.slice(0, index),
        key: '"' + val.slice(index + 1) + '"'
      }
    // 否则就只是单纯的获取这个值
    } else {
      return {
        exp: val,
        key: null
      }
    }
  }
// 走到这里说明val中存在[]的动态内容
  str = val
  index = expressionPos = expressionEndPos = 0

  while (!eof()) {
    // 
    chr = next()
    /* istanbul ignore if */
    // chr是"或'，先判断引号是防止[在引号里面
    if (isStringStart(chr)) {
      // 一直获取下一个字符，知道结束或者"、'闭合
      parseString(chr)
    // 0x5B = [
    } else if (chr === 0x5B) {
      parseBracket(chr)
    }
  }
  // 返回内容的key和value
  return {
    exp: val.slice(0, expressionPos),
    key: val.slice(expressionPos + 1, expressionEndPos)
  }
}

function next (): number {
  // 获取下个字符
  return str.charCodeAt(++index)
}

function eof (): boolean {
  return index >= len
}

function isStringStart (chr: number): boolean {
  // 0x22 = "   0x27='
  return chr === 0x22 || chr === 0x27
}
// 扫描[]标签，设置expressionPos的范围
function parseBracket (chr: number): void {
  // 计数未闭合的[]的数量
  let inBracket = 1
  expressionPos = index
  while (!eof()) {
    chr = next()
    // 跳过引号的内容
    if (isStringStart(chr)) {
      parseString(chr)
      continue
    }
    // 0x5B = [
    // []
    if (chr === 0x5B) inBracket++
    // 0x5D = ]
    if (chr === 0x5D) inBracket--
    // 全部闭合完成，跳出循环
    if (inBracket === 0) {
      expressionEndPos = index
      break
    }
  }
}

function parseString (chr: number): void {
  const stringQuote = chr
  // 一直获取下一个字符，知道结束或者"、'闭合
  while (!eof()) {
    chr = next()
    if (chr === stringQuote) {
      break
    }
  }
}
