/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {
    this.value = value
    // 用来通知、保存订阅者数列
    // 这里给数据触发更新的时候使用
    this.dep = new Dep()
    this.vmCount = 0
    // 通过object.defineProperty定义一个不可枚举的__ob__属性，
    // 这个属性可以在触发更新时，手动调用dep.notify来通知订阅者
    def(value, '__ob__', this)
    // value是Array
    if (Array.isArray(value)) {
      // 浏览器支持 __proro__ 属性访问原型对象
      if (hasProto) {
        // 通过__proro__继承数组的方法， arrayMethods 是继承了数组方法的对象
        protoAugment(value, arrayMethods)
      } else {
        // 通过循环添加
        copyAugment(value, arrayMethods, arrayKeys)
      }

      // 数组会循环调用每一项，如果子项是数组或者对象，也会调用Observer方法
      this.observeArray(value)

      // value是对象
    } else {
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk (obj: Object) {
    const keys = Object.keys(obj)
    // 对对象的每一项调用definReactive定义为响应式的对象
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
export function observe (value: any, asRootData: ?boolean): Observer | void {
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
  // 是否已经定义过了，定义过的话会定义一个__ob__属性
  // 1. 防止对同一个值反复定义__ob__属性
  // 2. 可以通过__ob__获取到当前的Observer，方便访问定义的方法
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    // 只有数组或者对象可以定义为响应式的，普通的数值是不行的
    // 这也是为什么data要定义为对象的原因
    (Array.isArray(value) || isPlainObject(value)) &&
    // value是可以扩展的，被冻结(Object.freeze,Object.preventExtensions,Object.seal等)的对象是不能添加属性的
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    ob = new Observer(value)
  }
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {

  // 初始化一个订阅对象，当触发get的时候来添加订阅者
  const dep = new Dep()

  const property = Object.getOwnPropertyDescriptor(obj, key)
  // 对象必须是可配置的
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  // 这里会看我们是否自己定义了getter和setter函数
  const getter = property && property.get
  const setter = property && property.set
  // length 不等于2说明传递了val字段，就不用再获取了
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  // 不是浅响应式，则对val也调用observe，val可能是数组或对象
  // 递归调用observer函数
  let childOb = !shallow && observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      // 定义了get方法的话则会调用定义的方法，否则返回val
      const value = getter ? getter.call(obj) : val

      // Dep.target 是当前的观察者对象，在mountComponent中会new Wacher，
      // 当我们调用watcher的get()函数时，会调用pushTarget(this)，this会被赋值给Dep.target
      // 当触发get函数的时候，就可以通过dep.depend来将当前的watcher添加这个的订阅者中去
      if (Dep.target) {
        dep.depend()

        // 当value是Array的时候，只对数组中值是对象的进行defineProperty
        // 而我们获取普通值是无法触发数组每一项的get函数的，当我们通过this获取时，
        // 这里会把当前的watcher添加到value的dep中
        if (childOb) {
          // 当前的这个val如果是引用类型的话，子元素也应该
          // 添加当前的Watcher，子元素改动，也要通知这个watcher
          childOb.dep.depend()

          // 处理vue.$set的逻辑
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      // 获取到之前的值
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      // value变化了才会触发set
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      // 通过Object.defineProerty值定义了get，没有定义set，所以set无效
      if (getter && !setter) return
      // 定义了setter函数的话则调用我们定义的setter函数
      if (setter) {
        // 调用自定义的setter
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      // 对新赋值的值进行转换为observe
      childOb = !shallow && observe(newVal)
      // 通知每一个watcher更新
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  // array的的话调用splice方法，最后也会调用dep.notify
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  // 如果是以存在的key，则直接赋值
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  // 没有ob，则说明target是一个普通对象
  if (!ob) {
    target[key] = val
    return val
  }
  // 新赋的值也定义为响应式的
  defineReactive(ob.value, key, val)
  // 调用dep的notify方法通知每一个订阅者更新
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
