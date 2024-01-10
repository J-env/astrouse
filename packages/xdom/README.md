# @astrouse/xdom

## Description

- 内置指令和插件指令以 `x:` 开头, eg: `x:scope=""`

- 用户自定义指令以 `use:` 开头, eg: `x-use:focus="values"` `use:focus="values"`

- 事件绑定以 `on:` 开头, eg: `x-on:click="fn"`, `on:click="fn"`, `on:custom-event="fn"`

- `data-x-dom` dom 标记（插件会自动添加），用于性能优化

## Usage

```html
<div x:scope="">
  <div>app count: <span x:text="count"></span></div>
  <button on:click="increment">app increment</button>
</div>

<div x:scope="counter({ count: 0 }, $el)">
  <span x:text="count"></span>
  <button on:click="increment">increment</button>
</div>

<script>
  import { Vuedom, createApp, reactive } from '@astrouse/xdom';

  const store = reactive({});

  const app = createApp({
    store,

    count: 0,
    // getters
    get plusOne() {
      return this.count + 1;
    },
    increment() {
      this.count++;
    }
  });

  app.setConfig({});

  app.mount();

  Vuedom.scope('counter', (props, $el) => {
    return {
      count: props.count,
      increment() {
        this.count++;
      }
    };
  });
</script>
```

## 事件绑定 `x-on:` 或 `on:`

- [ ] `on:click` 如果是 [这些事件](./docs/delegate.md) , 会自动委托到 document
- [ ] `on:@click` 这样就不会委托

- [ ] `on:mounted` 内置事件 - 挂载
- [ ] `on:unmounted` 内置事件 - 卸载

- [ ] `on:custom-event` 自定义事件

## 内置指令及插件指令 x:

- [ ] `x:scope` data 作用域

- [ ] `x:effect` effect 函数指令

- [ ] `x:show` 显示隐藏

- [ ] `x:transition` 过度, 和 `x:show` 结合使用

- [ ] `x:ref` 可以轻松地直接访问 DOM 元素

- [ ] `x:text` 设置 textContent

- [ ] `x:html` 设置 innerHTML

- [ ] `x:model` 双向绑定

- [ ] `x:for` for 循环

- [ ] `x:if` if

- [ ] `x:cloak` 默认这个元素是隐藏的，在某些情况下才会显示这个元素

- [ ] `x:teleport` 把当前元素 渲染到指定位置

- [ ] `x:position` 定位到某个元素跟前

- [ ] `x:visible` IntersectionObserver

- [ ] `x:bind` 动态的绑定一个或多个 attribute

## 绑定 dom attrs 或者 dom props `bind:` 或 `x-bind:` 或 `:`

- [ ] `bind:class`

- [ ] `bind:style`

## 用户自定义指令 `x-use:` 或 `use:`

- [ ] `use:focus="values"`

## 魔术字段

- [ ] `$el`

- [ ] `$refs`

- [ ] `$app`

- [ ] `$store`

- [ ] `$root`

- [ ] `$dispatch`

- [ ] `$nextTick`

## api

```ts
import { Vuedom } from '@astrouse/xdom';

Vuedom.scope('counter', () => {
  return {};
});

Vuedom.store('counter', {});

Vuedom.plugin('collapse', function () {});

Vuedom.directive('my-directive', function () {});

Vuedom.magic('clipboard', {});

Vuedom.bind('SomeAttrs', () => ({
  type: 'button',

  'on:click'() {
    this.doSomething();
  },

  doSomething() {},

  'bind:disabled'() {
    return this.shouldDisable;
  }
}));
```
