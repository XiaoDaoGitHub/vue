/* @flow */

import * as nodeOps from 'web/runtime/node-ops'
import { createPatchFunction } from 'core/vdom/patch'
// 定义了创建、更新directive，ref逻辑
import baseModules from 'core/vdom/modules/index'
// 平台相关的生成代码如web平台是创建属性、事件等代码
import platformModules from 'web/runtime/modules/index'

// the directive module should be applied last, after all
// built-in modules have been applied.

const modules = platformModules.concat(baseModules)

export const patch: Function = createPatchFunction({ nodeOps, modules })
