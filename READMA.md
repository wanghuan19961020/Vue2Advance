# 几种实现双向绑定的做法
目前几种主流的 mvc(vm) 框架都实现了单向数据绑定，而我所理解的双向数据绑定无非就是在单向绑定的基础上给定可输入元素
(input、textare等) 添加了 change(input) 事件，来动态修改 model 和 view，并没有多高深。所以无需太过介怀是实
现的单向或双向绑定。

实现数据绑定的做法有大致如下几种：
```
发布者-订阅者模式（backbone.js）

脏值检查（angular.js）

数据劫持（vue.js）
```

**发布者-订阅者模式：**一般通过 sub,pub 的方式实现数据和视图的绑定监听，更新数据方式通常做法是 `vm.set('property', valeu)`

这种方式现在毕竟太 low 了，我们更希望通过 `vm.property = value` 这种方式更新数据，同时自动更新视图，于是有了下面两种方式

**脏值检查**: angular.js 是通过脏值检测的方式比对数据是否有变更，来决定是否更新视图，最简单的方式就是通过 `setInterval()`
 定时轮询检测数据变动，当然Google不会这么low，angular只有在指定的事件触发时进入脏值检测，大致如下：
- DOM事件，譬如用户输入文本，点击按钮等。( ng-click )
- XHR响应事件 ( $http )
- 浏览器Location变更事件 ( $location )
- Timer事件( timeout ,interval )
- 执行 digest() 或apply()

**数据劫持**: vue.js 则是采用数据劫持结合发布者-订阅者模式的方式，通过 `Object.defineProperty()` 来劫持各个属性的`setter`，`getter`，
在数据变动时发布消息给订阅者，触发相应的监听回调。
# MVVM原理
Vue响应式原理最核心的方法便是通过`Object.defineProperty()`来实现对属性的劫持，达到监听数据变动的目的，无疑这个方法是本文中最重要、最基础的内容之一

整理了一下，要实现mvvm的双向绑定，就必须要实现以下几点：
1. 实现一个数据监听器Observer，能够对数据对象的所有属性进行监听，如有变动可拿到最新值并通知订阅者
2. 实现一个指令解析器Compile，对每个元素节点的指令进行扫描和解析，根据指令模板替换数据，以及绑定相应的更新函数
3. 实现一个Watcher，作为连接Observer和Compile的桥梁，能够订阅并收到每个属性变动的通知，执行指令绑定的相应回调函数，从而更新视图
4. mvvm入口函数，整合以上三者

![在这里插入图片描述](https://img-blog.csdnimg.cn/img_convert/354de38cd4767d88712116de6d03f139.png#pic_center)

先看之前vue的功能
```html
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>Document</title>
</head>

<body>
    <div id="app">
        <h2>{{obj.name}}--{{obj.age}}</h2>
        <h2>{{obj.age}}</h2>
        <h3 v-text='obj.name'></h3>
        <h4 v-text='msg'></h4>
        <ul>
            <li>1</li>
            <li>2</li>
            <li>3</li>
        </ul>
        <h3>{{msg}}</h3>
        <div v-html='htmlStr'></div>
        <div v-html='obj.fav'></div>
        <input type="text" v-model='msg'>
        <img v-bind:src="imgSrc" v-bind:alt="altTitle">
        <button v-on:click='handlerClick'>按钮1</button>
        <button v-on:click='handlerClick2'>按钮2</button>
        <button @click='handlerClick2'>按钮3</button>
    </div>
    <script src="./vue.js"></script>
    <script>
        let vm = new MVue({
            el: '#app',
            data: {
                obj: {
                    name: '小马哥',
                    age: 19,
                    fav:'<h4>前端Vue</h4>'
                },
                msg: 'MVVM实现原理',
                htmlStr:"<h3>hello MVVM</h3>",
                imgSrc:'https://timgsa.baidu.com/timg?image&quality=80&size=b9999_10000&sec=1568782284688&di=8635d17d550631caabfeb4306b5d76fa&imgtype=0&src=http%3A%2F%2Fh.hiphotos.baidu.com%2Fimage%2Fpic%2Fitem%2Fb3b7d0a20cf431ad7427dfad4136acaf2fdd98a9.jpg',
                altTitle:'眼睛',
                isActive:'true'

            },
            methods: {
                handlerClick() {
                    alert(1);
                    console.log(this);
                    
                },
                handlerClick2(){
                    console.log(this);
                    alert(2)
                }
            }

        })
    </script>
</body>

</html>
```
# 实现指令解析器Compile
实现一个指令解析器Compile，对每个元素节点的指令进行扫描和解析，根据指令模板替换数据，以及绑定相应的更新函数,添加监听数据的订阅者，一旦数据有变动
，收到通知，更新视图，如图所示：
```javascript
const compileUtil = {
  getVal(expr, vm){
    return expr.split('.').reduce((data, currentVal) => {
      return data[currentVal.trim()]
    }, vm.$data)
  },
  text(node, expr, vm) { // expr:msg {{}}
    let value
    if (expr.indexOf('{{') !== -1) {
      // {{ person.name }} --- {{ person.age }}
      value = expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
        return this.getVal(args[1], vm)
      })
    } else {
      value = this.getVal(expr, vm)
    }
    this.updater.textUpdater(node, value)
  },
  html(node, expr, vm) {
    const value = this.getVal(expr, vm)
    this.updater.htmlUpdater(node, value)
  },
  model(node, expr, vm){
    const value = this.getVal(expr, vm)
    this.updater.modelUpdater(node, value)
  },
  on(node, expr, vm, eventName) {
    let fn = vm.$options.methods && vm.$options.methods[expr]
    node.addEventListener(eventName, fn.bind(vm), false)
  },
  bind(node, expr, vm, attrName) {
    const value = this.getVal(expr, vm)
    node.setAttribute(attrName, value)
  },
  // 更新的函数
  updater: {
    textUpdater(node, value) {
      node.textContent = value
    },
    htmlUpdater(node, value) {
      node.innerHTML = value
    },
    modelUpdater(node, value) {
      node.value = value
    }
  }
}

class Compile {
  constructor(el, vm) {
    this.el = this.isElement(el) ? el : document.querySelector(el)
    this.vm = vm
    // 1. 获取文档碎片对象 放入内存中 会减少页面的回流和重绘
    const fragment = this.node2Fragment(this.el)
    // 2. 编译模板
    this.compile(fragment)
    // 3. 追加子元素到根元素
    this.el.appendChild(fragment)
  }

  compile(fragment) {
    // 1. 获取子节点
    const childNodes = fragment.childNodes
    ;[...childNodes].forEach(child => {
      if (this.isElement(child)) {
        // 是元素节点 编译元素节点
        this.compileElement(child)
      } else {
        this.compileText(child)
      }
      if (child.childNodes && child.childNodes.length) { //节点是否有子节点，有则递归遍历
        this.compile(child)
      }
    })
  }

  compileElement(node) {
    // <div v-text="msg"></div>
    const attributes = node.attributes
    ;[...attributes].forEach(attr => {
      const { name, value } = attr
      if(this.isDirective(name)) { // 是一个指令 v-text v-html v-model v-on:click
        const [ , directive] = name.split('-') // text html model on:click
        const [ dirName, eventName ] = directive.split(':') //dirName: text html model on bind
        // 更新数据 数据驱动视图
        compileUtil[dirName](node, value, this.vm, eventName)
        // 删除有指令的标签上的属性
        node.removeAttribute('v-' + dirName)
      } else if (this.isEventName(name)){ // @click="handleClick"
        let [, eventName] = name.split("@")
        compileUtil["on"](node, value, this.vm, eventName)
      }
    })
  }

  compileText(node) {
    // {{}}
    const content = node.textContent
    if (/\{\{(.+?)\}\}/.test(content)) {
      compileUtil['text'](node, content, this.vm)
    }
  }

  isEventName(attrName) {
    return attrName.startsWith("@")
  }

  isDirective(attrName) {
    return attrName.startsWith("v-")
  }

  node2Fragment(el) {
    // 创建文档碎片
    const f = document.createDocumentFragment()
    let firstChild
    /*
      `while(firstChild = el.firstChild)`
      这个语句进行了2个操作：
        1. 执行赋值操作：`firstChild = el.firstChild`
        2. 执行 `while(firstChild)`，`while` 是条件为真的情况下才执行，也就是必须 `el.firstChild` 有值得强狂下才执行

      当判定`while(firstChild)`为真的情况执行`fragment.appendChild(firstChild)`
      把`el.firstChild`即`el.children[0]`抽出插入到`fragment`。注意这个操作是`move dom`， `el.children[0]`被抽出，
      在下次`while`循环执行`firstChild = el.firstChild`时读取的是相对本次循环的`el.children[1]` 以此达到循环转移`dom`的目的
    */
    while(firstChild = el.firstChild) {
      f.appendChild(firstChild)
    }
    return f
  }

  isElement(node) {
    return node.nodeType === 1
  }
}

class MVue {
  constructor(options) {
    this.$el = options.el
    this.$data = options.data
    this.$options = options
    if (this.$el) {
      // 1. 实现一个数据的观察者
      // 2. 实现一个指令的解析器
      new Compile(this.$el, this)
    }
  }
}
```
# 实现数据监听器 Observer
```javascript
class Observer {
  constructor(data) {
    this.observe(data)
  }
  observe(data) {
    /*
      {
        person: {
          name: "张三",
          fav: {
            a: "爱好"
          }
        }
      }
    */
    if (data && typeof data === "object") {
      Object.keys(data).forEach(key => {
        this.defineReactive(data, key, data[key])
      })
    }
  }

  defineReactive(obj, key, value) {
    // 递归遍历
    this.observe(value)
    Object.defineProperty(obj, key, {
      enumerable: true,
      configurable: false,
      get() {
        // 订阅数据变化时，往Dep中添加观察者
        return value
      },
      set:(newVal) => {
        this.observe(newVal)
        if (newVal !== value) {
          value = newVal
        }
      }
    })
  }
}
```
```javascript
class MVue {
  constructor(options) {
    this.$el = options.el
    this.$data = options.data
    this.$options = options
    if (this.$el) {
      // 1. 实现一个数据的观察者
      new Observer(this.$data)
      // 2. 实现一个指令的解析器
      new Compile(this.$el, this)
    }
  }
}
```
# 实现 Watcher 去更新视图 & 实现 Dep 去收集依赖
```javascript
class Watcher {
  constructor(vm, expr, cb) {
    this.vm = vm
    this.expr = expr
    this.cb = cb
    // 先把旧值保存起来
    this.oldVal = this.getOldVal()
  }

  getOldVal() {
    Dep.target = this
    const oldVal = compileUtil.getVal(this.expr, this.vm)
    Dep.target = null
    return oldVal
  }

  update() {
    const newVal = compileUtil.getVal(this.expr, this.vm)
    if (newVal !== this.oldVal) {
      this.cb(newVal)
    }
  }
}
class Dep {
  constructor() {
    this.subs = []
  }
  // 收集观察者
  addSub(watcher) {
    this.subs.push(watcher)
  }

  // 通知观察者去更新
  notify() {
    this.subs.forEach(w => {
      w.update()
    })
  }
}

class Observer {
  // ......
  defineReactive(obj, key, value) {
    // 递归遍历
    this.observe(value)
    const dep = new Dep()
    Object.defineProperty(obj, key, {
      enumerable: true,
      configurable: false,
      get() {
        // 订阅数据变化时，往Dep中添加观察者
        Dep.target && dep.addSub(Dep.target)
        return value
      },
      set:(newVal) => {
        this.observe(newVal)
        if (newVal !== value) {
          value = newVal
        }
        // 告诉 Dep 去通知变化
        dep.notify()
      }
    })
  }
}
```
```javascript
const compileUtil = {
  // ......
  getContentVal(expr, vm) {
    return expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
      return this.getVal(args[1], vm)
    })
  },
  text(node, expr, vm) { // expr:msg {{}}
    let value
    if (expr.indexOf('{{') !== -1) {
      // {{ person.name }} --- {{ person.age }}
      value = expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
        new Watcher(vm, args[1], newVal => {
          this.updater.textUpdater(node, this.getContentVal(expr, vm))
        })
        return this.getVal(args[1], vm)
      })
    } else {
      value = this.getVal(expr, vm)
    }
    this.updater.textUpdater(node, value)
  },
  html(node, expr, vm) {
    const value = this.getVal(expr, vm)
    new Watcher(vm, expr, newVal => {
      this.updater.htmlUpdater(node, newVal)
    })
    this.updater.htmlUpdater(node, value)
  },
  model(node, expr, vm){
    const value = this.getVal(expr, vm)
    new Watcher(vm, expr, newVal => {
      this.updater.modelUpdater(node, newVal)
    })
    this.updater.modelUpdater(node, value)
  },
  // ......
}
```
# 实现数据双向绑定 & 数据代理 Proxy
```javascript
const compileUtil = {
  // ...... 
  setVal(expr, vm, inputVal) {
    expr.split('.').reduce((data, currentVal, currentIndex, array) => {
      if (currentIndex === array.length - 1) {
        data[currentVal.trim()] = inputVal
        return
      }
      return data[currentVal.trim()]
    }, vm.$data)
  },
  // ......
  model(node, expr, vm){
    const value = this.getVal(expr, vm)
    // 绑定更新函数 数据 => 视图
    new Watcher(vm, expr, newVal => {
      this.updater.modelUpdater(node, newVal)
    })
    // 视图 => 数据 => 视图
    node.addEventListener('input', e => {
      // 设置值
      this.setVal(expr, vm, e.target.value)
    })
    this.updater.modelUpdater(node, value)
  },
  // ......
}
```
```javascript
class MVue {
  constructor(options) {
    // ......
    if (this.$el) {
      // 1. 实现一个数据的观察者
      new Observer(this.$data)
      // 2. 实现一个指令的解析器
      new Compile(this.$el, this)
      this.proxyData(this.$data)
    }
  }
  proxyData(data) {
    for (const key in data) {
      Object.defineProperty(this, key, {
        get() {
          return data[key]
        },
        set(newVal) {
          data[key] = newVal
        }
      })
    }
  }
}
```
# 转载
* 作者：前端开发小马哥
* 链接：https://juejin.im/post/6844904183938678798
* 来源：掘金
* 著作权归作者所有。商业转载请联系作者获得授权，非商业转载请注明出处。