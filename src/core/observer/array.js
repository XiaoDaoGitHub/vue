/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

const arrayProto = Array.prototype
export const arrayMethods = Object.create(arrayProto)


// 这里定义的方法可以响应式的修改数组的值，
// 因为它这里对这些方法进行了拦截
const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 * 对数组的部分方法进行拦截，手动实现响应式
 */
methodsToPatch.forEach(function (method) {
  // cache original method
  // 通过闭包缓存数组原型已有的同名方法
  const original = arrayProto[method]
  // 通过Object.defineProperty重新定义相同名称的方法
  def(arrayMethods, method, function mutator (...args) {
    // 调用原有的方法求值
    const result = original.apply(this, args)
    // 创建observer对象的时候会挂载一个__ob__对象，
    // 既可以防止重复定义，也方便添加新属性的时候可以方便调用转换方法
    const ob = this.__ob__
    let inserted
    switch (method) {
      // 这三个方法会在数组上新增元素，通过 ob 来将新增的
      // 数值转换为观察者对象
      case 'push':
      case 'unshift':
        inserted = args
        break
      // splice方法第三个参数以后才是插入的数值
      case 'splice':
        inserted = args.slice(2)
        break
    }
    // 有新增的元素，则调用转换方法
    if (inserted) ob.observeArray(inserted)
    // notify change
    // 当前的观察者对象属性发生了变法，通知订阅者
    ob.dep.notify()

    // 返回修改后的值
    return result
  })
})
