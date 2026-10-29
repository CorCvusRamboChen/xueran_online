# 血染钟楼 × 旺财：语音代管对接说明

写给旺财（或其它已经在服务器里管语音的 Discord 机器人）的开发者 / AI Agent。

## 背景

血染钟楼是一个 Discord 活动（Activity，"小程序"）：大家在语音频道里聊天，在活动里玩。游戏过程中要动语音：

- 夜里给所有玩家**服务器闭麦 + 闭耳**，天亮解开；有人发言时让其他人闭麦；
- 白天私聊时**建一个只有几个人看得到的临时语音房间**，把人拉进去，聊完送回广场、删掉房间。

以前这些要把我们的机器人请进你们服务器，还得给它拉人、闭麦、管频道的权限。现在改成：**你们的机器人（旺财）替我们做这些操作**，
你们服务器只需要装上血染钟楼这个活动，我们的机器人不用进来。

## 你们要做的（大约 10 分钟）

### 1. 复制模块

把本仓库的 [`integrations/wangcai/botc-voice.js`](../integrations/wangcai/botc-voice.js) 整份复制到旺财的项目里（比如 `src/botc-voice.js`）。
它只依赖 `discord.js` v14 和 Node 自带模块，不需要装新包。

### 2. 接三行

在机器人登录好以后（`ready` 事件里）：

```js
import { createBotcVoice } from './botc-voice.js';

const botc = createBotcVoice({
  client,                                              // 你的 discord.js Client
  secret: process.env.BOTC_SYNC_TOKEN,                 // 共享密钥，我们私下发给你
  guildIds: (process.env.BOTC_GUILD_IDS || '').split(','), // 允许血染钟楼操作的服务器 id
  pushUrl: process.env.BOTC_PUSH_URL,                  // https://botc.rambooo.com/api/partner/voice
});
botc.start(); // 开始把语音状态变化推给我们
```

然后二选一，让我们能调到 `/botc/voice`：

- **挂在你们现有的 HTTP 服务上**（比如给 SquadPool 用的那个 inbound，端口 4788）：在请求处理函数**最前面**、你们自己的鉴权之前加一行
  （它用自己的密钥鉴权，不走 SquadPool 的密钥）：

  ```js
  if (await botc.handle(req, res)) return;
  ```

- **或者单独开一个端口**：`botc.listen(4789);`

### 3. 加环境变量

```
BOTC_SYNC_TOKEN=<我们私下发给你，不要写进公开仓库>
BOTC_GUILD_IDS=<你们服务器的 id，多个用逗号隔开>
BOTC_PUSH_URL=https://botc.rambooo.com/api/partner/voice
```

### 4. 检查机器人权限和 intent

- Gateway intents：`Guilds`、`GuildVoiceStates`（旺财管语音的话应该已经有了）。
- 在要玩的服务器里，旺财的角色需要：**查看频道、连接、移动成员、使成员静音（闭麦）、使成员闭耳、管理频道、管理角色**
  （"管理角色"是给私聊房间设"只有这几个人看得到"的频道权限用的）。
- 旺财的角色要排在玩家角色**上面**，不然闭不了麦、拉不动人。

### 5. 告诉我们两件事

- `/botc/voice` 的地址，比如 `https://你们的域名:4788`（能用 HTTPS 最好，见下面"安全"）；
- 服务器 id。

我们这边配好就能用。

### 6. 装上活动

服务器管理员用我们给的安装链接把"血染钟楼"装进服务器（只装活动，不带机器人）。
之后在**文字频道**输入框旁边的应用启动器（🚀）里打开它。大家先进同一个语音频道，**房主所在的语音频道就是广场**。

> 别从语音频道里启动活动：活动会绑在那个语音频道上，机器人一把人拉去私聊房间，那个人的活动就被 Discord 关掉了。

## 自测

旺财启动后，在它那台机器上（把 `<token>`、端口、服务器 id 换成真的）：

```bash
curl -s -X POST -H "Authorization: Bearer <token>" -d '{"op":"ping"}' http://127.0.0.1:4788/botc/voice
# → {"ok":true,"botId":"旺财的用户 id"}

curl -s -X POST -H "Authorization: Bearer <token>" -d '{"op":"state","guildId":"<服务器id>","userIds":["<你自己的用户id>"]}' http://127.0.0.1:4788/botc/voice
# → {"ok":true,"states":{"<你的id>":{"channelId":"你所在的语音频道","serverMute":false,"serverDeaf":false}}}
```

密钥错了会返回 401；服务器 id 不在 `BOTC_GUILD_IDS` 里会返回 `guild_not_allowed`。

## 模块帮你守住的边界

就算我们这边出 bug、或者密钥泄露，旺财也不会被拿去乱动你们的服务器：

- 只认 `BOTC_GUILD_IDS` 里的服务器；
- 拉人只能拉到这个服务器的语音频道；
- 改频道权限、删频道**只对它自己用 `createRoom` 建出来的私聊房间生效**（建过的房间记在 `data/botc-rooms.json`，重启后还认得），
  你们原有的频道一律碰不到；
- 闭麦闭耳：我们那边只闭"正在本局广场 / 房子 / 私聊房间里"的人，在别的频道聊天的不碰；自己闭上的自己一定解开；
  管理员事先闭上的人既不闭也不解（这些规矩在我们的 `src/server/voice.js`，有测试）。

安全建议：`/botc/voice` 能闭麦、拉人，地址最好走 HTTPS（反向代理或 Cloudflare Tunnel）；明文 HTTP 的话密钥在路上能被看到。
我们的服务器出口 IP 不固定，**别用 IP 白名单**，靠密钥鉴权。密钥要换的话双方同时改一下就行。

## 接口说明（不用我们的模块、自己实现时看）

所有请求：`POST {你们的地址}/botc/voice`，`Authorization: Bearer <BOTC_SYNC_TOKEN>`，JSON body 里 `op` 决定做什么。
成功返回 `{"ok":true, ...}`，失败返回 `{"ok":false,"error":"原因"}`（HTTP 200；鉴权失败 401）。

| op | 请求 | 返回 | 做什么 |
|---|---|---|---|
| `ping` | — | `botId` | 我们启动时确认连得上 |
| `state` | `guildId`, `userIds`（≤50） | `states: {id: {channelId, serverMute, serverDeaf}}` | 这些人在哪个语音频道、有没有被服务器闭麦闭耳；不在语音里 `channelId` 为 `null` |
| `edit` | `guildId`, `userId`, 可选 `mute`, `deaf`, `channelId` | — | 服务器闭麦 / 闭耳 / 拉到某个语音频道（人得在语音里） |
| `createRoom` | `guildId`, `name`, `memberIds`, `squareChannelId` | `channelId` | 在广场同一个分组里建语音频道：@everyone 看不到，机器人和 `memberIds` 能进能说话 |
| `allow` | `guildId`, `channelId`, `userId` | — | 给这个人私聊房间的权限 |
| `disallow` | `guildId`, `channelId`, `userId` | — | 收回权限 |
| `channel` | `guildId`, `channelId` | `exists`, `isVoice`, `memberIds` | 频道在不在、是不是语音、里面有谁 |
| `deleteChannel` | `guildId`, `channelId` | — | 删私聊房间（只能删自己建的） |

**推送**：有人进出语音频道、或者服务器闭麦 / 闭耳状态变了，`POST https://botc.rambooo.com/api/partner/voice`，
同样带 `Authorization: Bearer <BOTC_SYNC_TOKEN>`，body：

```json
{ "guildId": "…", "userId": "…", "channelId": "进去的频道，退出语音时为 null", "serverMute": false, "serverDeaf": false }
```

推送失败不要紧（我们会定时来问 `state`），只是夜里中途进语音的人闭麦会慢一点。

## 给 AI Agent 的一句话版

> 把 xueran_online 仓库里的 `integrations/wangcai/botc-voice.js` 复制进本项目；在 `ready` 里用 `createBotcVoice({ client, secret: BOTC_SYNC_TOKEN, guildIds: BOTC_GUILD_IDS.split(','), pushUrl: BOTC_PUSH_URL })` 创建并调用 `.start()`；在现有 inbound HTTP 服务的请求处理函数最前面加 `if (await botc.handle(req, res)) return;`（没有现成服务就 `botc.listen(4789)`）；`.env` 加上那三个变量；按"自测"一节用 curl 验证 ping 和 state。

---

<details>
<summary>我们这边怎么配（血染钟楼维护者看）</summary>

在服务器的 `botc.env` 里（`bash scripts/set-secret.sh 名字` 写入，会自动重启）：

```
PARTNER_BOT_URL=对方 /botc/voice 所在的地址（不带 /botc/voice）
PARTNER_BOT_TOKEN=和对方约定的共享密钥（和对方的 BOTC_SYNC_TOKEN 同一个值）
PARTNER_BOT_GUILDS=对方服务器 id，多个用逗号
```

这些服务器里的局，语音操作全部发给对方（`src/server/partner.js`）；其它服务器照旧用我们自己的机器人。
Discord 开发者后台 → Installation 里要打开 Guild Install（scope 只要 `applications.commands`），
对方管理员用 `https://discord.com/oauth2/authorize?client_id=<我们的 client id>&scope=applications.commands` 装活动。

</details>
