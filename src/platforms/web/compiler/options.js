/* @flow */

import {
  isPreTag,
  mustUseProp,
  isReservedTag,
  getTagNamespace
} from '../util/index'

import modules from './modules/index'
import directives from './directives/index'
import { genStaticKeys } from 'shared/util'
import { isUnaryTag, canBeLeftOpenTag } from './util'

export const baseOptions: CompilerOptions = {
  expectHTML: true,
  modules,
  // v-modle/text/html
  directives,
  // 是不是pre标签
  isPreTag,
  // 是不是单标签如img/input
  isUnaryTag,
  // 像select这样的标签，是必须有子元素的
  mustUseProp,
  // 是不是单闭合标签
  canBeLeftOpenTag,
  // 
  isReservedTag,
  // 获取标签的命名空间？
  getTagNamespace,
  // 获取modules的名称
  staticKeys: genStaticKeys(modules)
}
