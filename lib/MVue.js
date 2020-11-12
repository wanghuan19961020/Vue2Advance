const compileUtil = {
  getVal(expr, vm){
    return expr.split('.').reduce((data, currentVal) => {
      return data[currentVal.trim()]
    }, vm.$data)
  },
  setVal(expr, vm, inputVal) {
    expr.split('.').reduce((data, currentVal, currentIndex, array) => {
      if (currentIndex === array.length - 1) {
        data[currentVal.trim()] = inputVal
        return
      }
      return data[currentVal.trim()]
    }, vm.$data)
  },
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
        // 绑定观察者，将来数据发生变化 触发这里的回调 进行更新
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