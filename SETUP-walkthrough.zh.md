# 部署说明(人看的中文版,对照 SETUP.md)

SETUP.md 是写给**受限机器上的 opencode 自己执行**的(那台机器没有网络,
只能靠人把这个仓库打成 zip 传过去,再让 opencode 在本地读着 SETUP.md
一步步跑).这份文件是给旁边盯着看的人(或者自己手动操作时)用的,
按 SETUP.md 相同的步骤编号,讲清楚每一步在做什么,为什么,以及怎么
判断做对了没有.命令本身以 SETUP.md 为准,这里不追求逐字对照.

## 背景

- 这台机器完全没有外网访问权限.
- 仓库内容是在另一台能上网的沙箱机器上下载成 zip,再传输过来解压的
  (类似 U 盘传输,不管中间用的是真 U 盘还是沙箱 app 的"拖拽导出",
  效果一样).
- 目标:让本地 opencode 用仓库里的 `deploy/system-prompt.txt` 替换掉它内置的
  啰嗦新手向 prompt,同时不破坏这台机器已经配好的 vLLM provider
  配置.

## 第 0 步:确认配置目录 + 找到解压后的源码

`opencode debug paths` 这条命令会打印出 opencode 在这台机器上实际用的各个目录,其中 `config` 那一行就是我们要改的目标目录(一般是 `~/.config/opencode`,但不同机器可能不一样,一切以命令的实际输出为准,不要凭经验假设路径)。`cache` 那一行(下面记作 `$CACHE_DIR`)第 4/5 步装插件时也要用到,一并记下来。

然后要在 Desktop/Downloads 之类的地方找到解压出来的
`opencode-qwen-prompt-master` 文件夹(GitHub 导出 zip 会自动加上分支名
后缀).这一步纯粹是"人工确认文件确实传过来了",没有网络操作.

## 第 1 步:拷贝 prompt 文件

就是把 `deploy/system-prompt.txt` 复制到 opencode 的配置目录下.这一步不涉及
判断,纯拷贝.

## 第 2 步:接入 opencode.json

这是最关键,也最容易出错的一步.核心逻辑:

- 如果这台机器上**还没有** `opencode.json`:先拿仓库里的
  `deploy/opencode.json.example` 当起点,但里面**没有**真正的 vLLM
  provider 配置——那部分要靠这台机器的负责人自己补上去,这个仓库不知道
  真实的模型服务地址.
- 如果**已经有** `opencode.json`(大概率如此,provider 配置应该早就配好
  了):不能整个覆盖,只能往里面**合并**一个 `agent` 字段,让
  `build`/`plan`/`general` 三个 agent 都指向 `system-prompt.txt`.已有的
  provider,权限等配置原样保留.

判断做对了没有:改完之后用 `python -m json.tool` 之类的工具验证一下
JSON 语法没错,这一步 SETUP.md 里有具体命令.

## 第 3 步(可选):让 models.dev 目录数据走本地文件而不是联网

opencode 内部会维护一份"模型元数据目录"(境内俗称 models.dev 目录,
实际访问的是 `https://models.opencode.ai/api.json`),用来知道各家
provider 支持哪些模型,上下文长度,价格等信息.这台机器完全没网,
这个联网请求注定失败——但**不是致命问题**:

- 就算缓存文件不存在,opencode 的离线单文件版本在编译时就已经把这份
  目录数据打包进了程序本体,第一次启动照样能拿到(哪怕是过期的)数据,
  不会因为没网就卡住或崩溃.
- 唯一真正会尝试联网的,是一个每 60 分钟跑一次的后台刷新任务——失败了
  也只是往日志里写一行错误,不影响使用.

如果不想看到这行徒劳的报错日志,有两种处理方式(都是**环境变量**,
不是写在 `opencode.json` 里的东西):

1. 图省事:设 `OPENCODE_DISABLE_MODELS_FETCH=1`,直接不让它联网,
   靠编译时打包的旧数据过日子.反正咱们用的是自定义 vLLM
   provider,这份目录数据本来也用不上.
2. 想要相对新一点的数据:仓库里带了一份
   `deploy/models-dev-snapshot.json`(是在能上网的机器上跑
   `opencode models --refresh` 导出来的),把它也拷进配置目录,然后
   **同时**设两个环境变量:

   ```
   OPENCODE_MODELS_PATH=<刚拷贝的那个 json 文件的绝对路径>
   OPENCODE_DISABLE_MODELS_FETCH=1
   ```

   **注意**:只设 `OPENCODE_MODELS_PATH` 是不够的——它只影响启动时
   第一次读取,那个每小时跑一次的后台刷新任务判断"要不要刷新"看的
   是另一个固定的缓存目录文件的修改时间,跟 `OPENCODE_MODELS_PATH`
   指向哪里没关系.所以两个变量必须一起设,否则后台还是会每小时
   徒劳地尝试联网一次.

## 第 4 步(可选但建议做):装查看器插件

这台机器是第一次真正对着 Qwen 模型跑这套配置,之前只在别的机器上用
opencode 自带的免费云模型验证过.装这个插件是为了能亲眼看到"最终真的
发给模型的 prompt 长什么样",否则出了问题很难判断是 prompt 没生效还是
模型本身的问题.

这个插件现在打包成了一个 npm tarball(`deploy/opencode-system-prompt-tools-1.0.0.tgz`),不再是直接拷一个裸 `.ts` 文件过去,也不是靠 `file:` 路径——这台机器既没有 registry 也不一定有 npm/node,所以改成手工把 tarball 解包,直接扔进 opencode 自己的包缓存目录(`$CACHE_DIR/packages/opencode-system-prompt-tools@1.0.0/`),然后在 `opencode.json` 的 `plugin` 数组里写一个裸的 `"opencode-system-prompt-tools@1.0.0"`,不带任何路径,跟下面第 5 步是同一套机制。这是因为 opencode 解析 `plugin` 条目时,是按配置里写的那个字符串原样去 `~/.cache/opencode/packages/` 下找同名目录,已经存在就直接复用、不再联网——这套做法已经在仓库自己的 docker 沙箱里断网测过,确认不联网也能装上(见 `docker/docker-notes.md`),理论上这台机器也应该一样。这靠的是 opencode 这个版本自己的内部缓存行为,不是它文档承诺的东西,如果 `opencode debug config` 里看不到这个 plugin 正确解析,不要瞎猜着改,如实在汇报里说清楚看到的实际情况。

## 第 5 步(可选):装 hook-logger / llm-review-gate 插件包

仓库里 `plugins/` 目录下还有两个跟 Qwen 这套 prompt 覆盖完全无关的
通用插件,除非明确想要,否则直接跳过这一步:

- `hook-logger.ts`——把 opencode 几乎所有 hook 事件都记成 JSONL 日志,
  纯调试/可观测性用途.
- `llm-review-gate.ts`——给每一次 `bash` 工具调用多加一道"LLM 安全审核":
  命令真正执行前,先发给一个隐藏的内部 opencode 会话打分,给
  ALLOW/BLOCK 判定,叠加在 opencode 自己的权限配置之上(不是替代).
  审核出错或超时默认放行.**这会真的改变运行时行为**(每次 bash 调用
  多一次隐藏的模型调用),装之前确认这是想要的效果.

装法跟第 4 步一样,只是换一个 tarball(`plugins/opencode-hook-plugins-1.0.0.tgz`),
装进同一个 `plugin` 数组里(合并,不要覆盖第 4 步已经写好的那一项).
这一个包里 `HookLogger`/`LlmReviewGate` 是绑在一起的,没法只装其中一个.

## 第 6 步(可选,目前还不完整):接入 Oracle MCP server

**这一步目前做不完整,遇到时先跟操作的人说清楚,别硬着头皮往下做**:
`mcp/oracle/` 需要 `@modelcontextprotocol/sdk` 和 `oracledb` 这两个 npm
依赖,这台机器没网装不了,仓库里也还没有像 `plugins/` 那样打包好离线
可用的版本(见 `mcp/TODO.md`).除非依赖已经提前打包好一起传过来了,
否则这一步先跳过.

跟第 4/5 步的插件不一样,Oracle MCP server 在 `opencode.json` 里是
`type: "remote"`——opencode 只是去连一个已经在跑的 HTTP 地址,不会自己
启动这个进程.也就是说这个 server 得有人单独用 `npm start`(或者进程
守护工具)先启动起来,并且一直保持运行,opencode 自己不管它的生死.

真实的 Oracle 连接信息(`ORACLE_CONNECT_STRING`/`ORACLE_USER`/
`ORACLE_PASSWORD`)需要问操作的人要,这个仓库不知道.

## 第 7 步(可选,目前还不完整):接入 Loki MCP server

跟第 6 步一样的情况,一样先跟操作的人说清楚:`mcp/loki/` 需要
`@modelcontextprotocol/sdk` 这一个 npm 依赖(比 Oracle 少一个,不需要
`oracledb` 那种驱动——见 `mcp/loki/README.md`),但一样是这台机器没网装
不了,除非依赖已经提前打包好一起传过来了.

同样是 `type: "remote"`,同样得有人单独启动 `npm start` 并保持运行,
opencode 自己不管它的生死.

跟 Oracle 不一样的地方:真正必须问操作的人要的只有一个
`LOKI_BASE_URL`(内网那台 Loki 的地址).如果那台 Loki 需要账号密码或者
租户 ID,才需要再问 `LOKI_USERNAME`/`LOKI_PASSWORD`/`LOKI_ORG_ID`——很多
内网 Loki 是不设密码的,这几个默认不用填.

## 第 8 步:验证

跑一句最简单的测试请求,然后(如果装了第 4 步的插件)打开
`~/.local/share/opencode/last-system-prompt.txt` 看真实发出去的内容:
应该以 `system-prompt.txt` 的内容开头,后面还会跟着 opencode 自己生成
的 `<env>` 信息块(当前目录,平台,日期等).如果看到的还是原来那种
啰嗦的新手向开场白,说明 `opencode.json` 里的配置没生效,先回去检查
JSON 有没有写错.如果是插件的 `file:` 路径没写对导致启动报错,那是第
4/5 步的问题,不代表 prompt 覆盖本身失败了.

## 第 9 步(可选):清理

zip 包和解压出来的文件夹用完可以删,真正长期需要留着的只有拷进配置
目录的 `system-prompt.txt`(和装了插件的话,插件的 tarball 文件;装了
Oracle/Loki MCP server 的话,那些文件).删之前问一下操作的人要不要
留着,不要自作主张删.

## 跑完之后要说清楚的事

- `opencode.json` 之前是没有还是已经存在?是新建的还是合并进去的?
- 第 8 步验证有没有确认新 prompt 真的生效了?如果没生效,实际看到的
  输出长什么样?
- 第 4/5 步装了哪些插件?单冒号的 `file:<路径>` 写法在这台机器上直接
  生效了,还是得换成 `file://` 那种 URI 形式?

这几点直接决定这次部署算不算成功,不能含糊带过.
