/* @flow */

import { toArray } from '../util/index'

export function initUse (Vue: GlobalAPI) {

  // 插件的安装方法
  Vue.use = function (plugin: Function | Object) {
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    // 防止重复安装插件
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    // 获取剩余参数
    const args = toArray(arguments, 1)
    // 把Vue添加到参数的第一个位置，所以
    // 插件的install方法的第一个参数是Vue对象
    args.unshift(this)
    // 默认调用plugin的install方法
    if (typeof plugin.install === 'function') {
      plugin.install.apply(plugin, args)
    // 没有install方法尝试调用plugin
    } else if (typeof plugin === 'function') {
      plugin.apply(null, args)
    }
    // 做缓存使用，方式重复安装
    installedPlugins.push(plugin)
    return this
  }
}
