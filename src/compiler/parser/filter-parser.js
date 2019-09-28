/* @flow */

const validDivisionCharRE = /[\w).+\-_$\]]/

export function parseFilters (exp: string): string {
  // 是否是单引号
  let inSingle = false
  // 是否是双引号
  let inDouble = false
  // 是否是字符串模板
  let inTemplateString = false
  // 是否是正则
  let inRegex = false
  // 大括号({)的数量，用于计算闭合大括号
  let curly = 0
  // 中括号([)的数量，用于计算闭合中括号
  let square = 0
  // 小括号(()的数量，用于计算闭合小括号
  let paren = 0
  let lastFilterIndex = 0
  let c, prev, i, expression, filters

  for (i = 0; i < exp.length; i++) {
    prev = c
    c = exp.charCodeAt(i)
    if (inSingle) {
      // 0x27 = '  0x5C = \
      if (c === 0x27 && prev !== 0x5C) inSingle = false
    } else if (inDouble) {
      // 0x22 = "   0x5C = \
      if (c === 0x22 && prev !== 0x5C) inDouble = false
    } else if (inTemplateString) {
      // 0x60 = `   0x5C = \
      if (c === 0x60 && prev !== 0x5C) inTemplateString = false
    } else if (inRegex) {
      // 0x2f = /  0x5C = \
      if (c === 0x2f && prev !== 0x5C) inRegex = false
    } else if (
      // 0x7C = |  
      c === 0x7C && // pipe
      // 后一位不是 | ，这样就避免了||语法
      exp.charCodeAt(i + 1) !== 0x7C &&
      // 前一位不是| ，避免和||语法混淆
      exp.charCodeAt(i - 1) !== 0x7C &&
      !curly && !square && !paren
    ) {
      if (expression === undefined) {
        // first filter, end of expression
        lastFilterIndex = i + 1
        expression = exp.slice(0, i).trim()
      } else {
        pushFilter()
      }
    } else {
      switch (c) {
        case 0x22: inDouble = true; break         // "
        case 0x27: inSingle = true; break         // '
        case 0x60: inTemplateString = true; break // `
        case 0x28: paren++; break                 // (
        case 0x29: paren--; break                 // )
        case 0x5B: square++; break                // [
        case 0x5D: square--; break                // ]
        case 0x7B: curly++; break                 // {
        case 0x7D: curly--; break                 // }
      }
      //  /可能是正则表达式
      if (c === 0x2f) { // 0x2f = /
        let j = i - 1
        let p
        // find first non-whitespace prev char
        for (; j >= 0; j--) {
          p = exp.charAt(j)
          if (p !== ' ') break
        }
        if (!p || !validDivisionCharRE.test(p)) {
          inRegex = true
        }
      }
    }
  }
  // 表示exp中没有特殊字符(字符串、正则、表达式等)，整个都是
  if (expression === undefined) {
    expression = exp.slice(0, i).trim()
  } else if (lastFilterIndex !== 0) {
    pushFilter()
  }

  function pushFilter () {
    (filters || (filters = [])).push(exp.slice(lastFilterIndex, i).trim())
    lastFilterIndex = i + 1
  }

  if (filters) {
    for (i = 0; i < filters.length; i++) {
      expression = wrapFilter(expression, filters[i])
    }
  }

  return expression
}

function wrapFilter (exp: string, filter: string): string {
  const i = filter.indexOf('(')
  if (i < 0) {
    // _f: resolveFilter
    return `_f("${filter}")(${exp})`
  } else {
    const name = filter.slice(0, i)
    const args = filter.slice(i + 1)
    return `_f("${name}")(${exp}${args !== ')' ? ',' + args : args}`
  }
}
