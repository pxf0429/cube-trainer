---
version: alpha
name: 魔方训练器
description: 面向日常魔方练习的工具，以题目、编码和操作反馈为中心。
colors:
  ground: "#f5f9ff"
  surface: "#ffffff"
  ink: "#1e4274"
  muted: "#4e6480"
  signal: "#326bb2"
  pink: "#e7a3bd"
  actionInk: "#24456e"
  gradientStart: "#d8e9ff"
  gradientEnd: "#f9dce9"
typography:
  display:
    fontFamily: "Microsoft YaHei, PingFang SC, sans-serif"
    fontSize: 24px
    fontWeight: 600
    letterSpacing: 0
  body:
    fontFamily: "Segoe UI, Microsoft YaHei, PingFang SC, sans-serif"
    fontSize: 14px
    lineHeight: 1.8
  notation:
    fontFamily: "Cascadia Code, Consolas, monospace"
rounded:
  sm: 5px
  md: 7px
spacing:
  sm: 8px
  md: 16px
  lg: 24px
components:
  button-primary:
    backgroundColor: "{colors.pink}"
    textColor: "{colors.actionInk}"
    rounded: "{rounded.sm}"
    padding: 12px 16px
---

## Overview

这是反复使用的练习工具。首页供选择项目，进入后让魔方、编码和答题操作占据主要位置。
延续用户指定的 Monkeytype 紧凑导航与聚焦练习区，以魔方展开图和实际编码作为识别特征。
本次使用 avoid-ai-design 的 dashboard / inside-design-system 方式进行局部调整，不重新选择视觉流派。

## Colors

蓝白粉渐变由用户明确选择，起止色可以在首页设置。保留默认值及存储方式。
蓝色用于导航和 EOLR，粉色用于 BLD 入口及主要操作。粉底按钮配深蓝文字。
正文 #1e4274；次要信息 #4e6480。在默认渐变两端和白色表面上均满足普通文字 4.5:1 对比度。
用户自行设置的任意深色背景不承诺同一对比度。
魔方贴纸色和用户的两桥、底色配置独立于界面颜色，不能随着 UI 配色修改。
“聚焦 LR”仅追踪两块目标棱（UL、UR）的两面贴纸：保持原色、增加黑白描边和 L/R 标记；
其余贴纸淡化为灰色内面，保留细彩色边框以判断 EO。立体、映射和展开图共用同一目标识别。

## Typography

中文沿用平台可用字体，不增加外部字体请求。24px 用于内容标题，14px 用于正文，12px 用于操作及说明。
编码、打乱、公式和耗时使用等宽字体，便于比较字符；不把等宽英文标签当作装饰。
随机编码是唯一允许特别放大的内容。导航不重复页面大标题。

## Layout

顶部导航为全站共享。各训练模块的页签在左、真实统计在右，手机上顺序排列。
首页只保留一组训练入口。EOLR 保留分类索引和魔方/答案两栏；小屏改为上下排列。
盲拧输入区保持窄而居中，图片在输入后显示。词库使用真实图片网格配编辑区，方案页保留展开图。
图鉴保留按大类分组的可展开列表，记录保留表格。不要把每一种内容都改为同样的卡片。

## Elevation & Depth

魔方观察区和词库图片使用白色实体表面；答案用浅蓝底；普通训练提示直接放在页面上。
阴影只用于覆盖内容的弹窗。不要为每层内容再包一层透明卡片或加彩色边条。

## Shapes

控件圆角 5px，内容表面 7px。魔方自身的几何形状及映射不参与此圆角规范。

## Components

页签、按钮、输入框使用共享主题。每个可交互元素必须有可见焦点；禁用和加载状态保持有效。
箭头只在前后切换及导航中保留；提交和确认用明确文字与勾选图标。
页脚仅保留帮助/许可入口，不添加英文口号和重复项目名。
错误、空状态和图片加载反馈保持可读，不能为了简洁而隐藏。

## Do's and Don'ts

- 保留用户的渐变背景、蓝白粉色、中文规则、训练记录、词库、图片及配色设置。
- 保留分类依赖链接、学习顺序和魔方三个隐藏面的映射。
- 所有页面复用同一导航、页签、文字色、按钮和页脚。
- 不添加装饰性 01/02/03、英文眉题、口号、无意义状态徽章或重复训练入口。
- 不采用奶油陶土或黑绿风格替换当前配色，不引入动效库或外部字体。
- 不通过隐藏规则、错误提示、图片来源或许可信息来清理界面。
