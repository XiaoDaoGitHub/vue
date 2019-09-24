/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { defineComputed, proxy } from '../instance/state'
import { extend, mergeOptions, validateComponentName } from '../util/index'

export function initExtend (Vue: GlobalAPI) {
  /**
   * Each instance constructor, including Vue, has a unique
   * cid. This enables us to create wrapped "child
   * constructors" for prototypal inheritance and cache them.
   */
  Vue.cid = 0
  let cid = 1

  /**
   * Class inheritance
   */
  Vue.extend = function (extendOptions: Object): Function {
    extendOptions = extendOptions || {}
    const Super = this
    const SuperId = Super.cid

    // 对组件缓存，防止同一组件反复extend
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {})
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId]
    }

    const name = extendOptions.name || Super.options.name
    if (process.env.NODE_ENV !== 'production' && name) {
      validateComponentName(name)
    }

    // 创建子类，该类继承自Vue
    // 用于初始化子组件，这样递归调用，就可以把所有组件都初始化了
    const Sub = function VueComponent (options) {
      this._init(options)
    }
    // 继承Vue的原型上的属性和方法
    Sub.prototype = Object.create(Super.prototype)
    // 修正constructor,重新执行Sub
    Sub.prototype.constructor = Sub
    Sub.cid = cid++
    // 合并一下属性和方法，在执行
    // 子组件的_init方式中，会调用initInternalComponent
    // 在里面会获取options
    Sub.options = mergeOptions(
      Super.options,
      extendOptions
    )
    // 保存对Super的引用
    Sub['super'] = Super

    // For props and computed properties, we define the proxy getters on
    // the Vue instances at extension time, on the extended prototype. This
    // avoids Object.defineProperty calls for each instance created.
    // 在原型上挂在对应的属性
    // 子组件的props在render器件就已经代理完成
    if (Sub.options.props) {
      initProps(Sub)
    }
    // 初始化计算属性
    if (Sub.options.computed) {
      initComputed(Sub)
    }

    // allow further extension/mixin/plugin usage
    // 继承方法。。
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // create asset registers, so extended classes
    // can have their private assets too.
    // Vue.component等自定义组件、过滤器、指令方法也继承下来
    // 不需要重复新建
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type]
    })
    // enable recursive self-lookup
    // 有名称的话对自己做一个引用，暂时还不太明白缘由
    if (name) {
      Sub.options.components[name] = Sub
    }

    // keep a reference to the super options at extension time.
    // later at instantiation we can check if Super's options have
    // been updated.
    // 对options做一个引用保留
    Sub.superOptions = Super.options
    Sub.extendOptions = extendOptions
    Sub.sealedOptions = extend({}, Sub.options)

    // cache constructor
    // 缓存该构造函数
    cachedCtors[SuperId] = Sub
    return Sub
  }
}

function initProps (Comp) {
  const props = Comp.options.props
  for (const key in props) {
    proxy(Comp.prototype, `_props`, key)
  }
}

function initComputed (Comp) {
  const computed = Comp.options.computed
  for (const key in computed) {
    defineComputed(Comp.prototype, key, computed[key])
  }
}
