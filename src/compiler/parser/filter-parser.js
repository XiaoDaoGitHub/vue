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
      // inSingle表示在单引号里面，此时又碰到了单引号，而前一个又不是\转义字符，说明是单引号的闭合
      if (c === 0x27 && prev !== 0x5C) inSingle = false
    } else if (inDouble) {
      // 0x22 = "   0x5C = \
      // inDouble表示在双引号里面，此时又碰到双引号，而前一个又不是\转义字符，说明双引号的闭合
      if (c === 0x22 && prev !== 0x5C) inDouble = false
    } else if (inTemplateString) {
      // 0x60 = `   0x5C = \
      // inTemplateString表示在模板字符串里面，此时又碰到了模板字符串，而前一个又不是\转义字符，说明是模板字符串的闭合
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
      // 并且不是在[、{、(里面，在这里面是就是其他含义了，不是管道符了
      !curly && !square && !paren
    ) {
      if (expression === undefined) {
        // first filter, end of expression
        // filter就从这里开始
        lastFilterIndex = i + 1
        // 管道前的就是表达式的值了
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
  // undefind说明到i为止都是表达式的值，可以直接截取
  if (expression === undefined) {
    expression = exp.slice(0, i).trim()
    // 循环结束，如果lastFilterIndex不为0，说明最后一个filter的值还未添加
  } else if (lastFilterIndex !== 0) {
    pushFilter()
  }
  // 用来保存多个filter
  function pushFilter () {
    // 保存前一个表达式的值
    (filters || (filters = [])).push(exp.slice(lastFilterIndex, i).trim())
    lastFilterIndex = i + 1
  }

  if (filters) {
    for (i = 0; i < filters.length; i++) {
      // 返回_f(filter, _f(filter2, exp ))这样的连续调用
      // 上一次调用的结果是下一次调用的参数
      // 但每一个filter的第一个参数都是上一次调用的返回值
      expression = wrapFilter(expression, filters[i])
    }
  }

  return expression
}

function wrapFilter (exp: string, filter: string): string {
  // filter是否有函数调用
  const i = filter.indexOf('(')
  // 没有立即执行函数则把表达式当做函数第一个参数传入
  if (i < 0) {
    // _f: resolveFilter
    return `_f("${filter}")(${exp})`
  } else {
    // 获取到filter的名称
    const name = filter.slice(0, i)
    // 获取参数
    const args = filter.slice(i + 1)
    // 如果传入了参数，则把表达式当做第一个参数，其他参数往后排
    return `_f("${name}")(${exp}${args !== ')' ? ',' + args : args}`
  }
}
