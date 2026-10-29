// 机器人在语音里干的活：夜里服务器闭麦闭耳、发言时让别人闭麦、开私聊语音房间、拉人、送回广场。
//
// 部署到别人的服务器时要守住两条：
// 1. 只动这一局的人、只在这一局的频道里动手。闭麦闭耳、拉人之前先看这个人在不在本局管着的频道里
//    （广场、各房子、私聊房间，见 Room.managedChannels）；在别的频道聊天的人一概不碰。
// 2. 自己闭上的自己一定解开，别人闭上的不碰。服务器闭麦是跟着人走的（换频道也还在），
//    所以机器人记一本账（data/voice-held.json）：谁、因为哪一局、哪个原因（发言 / 观战 / 夜里）被它闭上。
//    原因都没了就解开；人当时不在语音里解不开，等他下次进语音再解；机器人重启时把账上的全部解开，
//    还在进行的局读档后会重新闭上该闭的人。管理员事先闭上的人（账上没有的）机器人既不闭也不解。
//
// 平台差异（Discord / KOOK）都在"平台接口"里（见 discordPlatform 和 kook.js 的 kookPlatform），这里只管账和规矩：
//   onReady(fn)、onVoice(fn(guildId, userId))：登录好了 / 某人的语音状态变了
//   hasGuild(gid)
//   state(gid, uid) → { channelId, serverMute, serverDeaf } | null
//   edit(gid, uid, { mute?, deaf?, channel? })
//   isVoiceChannel(gid, ch)、createRoom(gid, name, ids, squareId) → 频道 id
//   allow(gid, ch, uid)、disallow(gid, ch, uid)、members(gid, ch) → [uid]、deleteChannel(gid, ch)
import fs from 'node:fs';
import path from 'node:path';
import { ChannelType, Events, PermissionFlagsBits as P } from 'discord.js';

const FILE = path.resolve('data/voice-held.json');
const OLD_FILE = path.resolve('data/asleep.json'); // 旧版只记了夜里闭耳的人
const SWEEP_MS = 60_000;
const MEMBER_ALLOW = [P.ViewChannel, P.Connect, P.Speak, P.SendMessages, P.ReadMessageHistory];
const BOT_ALLOW = [P.ViewChannel, P.Connect, P.MoveMembers, P.ManageChannels, P.SendMessages];

/** discord.js 的客户端包成平台接口。 */
export function discordPlatform(client) {
  const g = (gid) => client.guilds.cache.get(gid) ?? null;
  const ch = (gid, id) => g(gid)?.channels.cache.get(id) ?? null;
  return {
    onReady(fn) { client.once(Events.ClientReady, fn); },
    onVoice(fn) { client.on(Events.VoiceStateUpdate, (_, now) => fn(now.guild.id, now.id)); },
    hasGuild: (gid) => !!g(gid),
    state(gid, uid) {
      const vs = g(gid)?.voiceStates.cache.get(uid);
      return vs ? { channelId: vs.channelId ?? null, serverMute: !!vs.serverMute, serverDeaf: !!vs.serverDeaf } : null;
    },
    edit: (gid, uid, patch) => g(gid).members.edit(uid, patch),
    async isVoiceChannel(gid, id) {
      const c = ch(gid, id) ?? await g(gid)?.channels.fetch(id).catch(() => null);
      return !!c?.isVoiceBased?.();
    },
    async createRoom(gid, name, ids, squareId) {
      const guild = g(gid);
      const square = squareId ? ch(gid, squareId) : null;
      const c = await guild.channels.create({
        name: name.slice(0, 100),
        type: ChannelType.GuildVoice,
        parent: square?.parentId ?? null,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
          { id: client.user.id, allow: BOT_ALLOW },
          ...ids.map((id) => ({ id, allow: MEMBER_ALLOW })),
        ],
      });
      return c.id;
    },
    async allow(gid, id, uid) {
      await ch(gid, id)?.permissionOverwrites.edit(uid, { ViewChannel: true, Connect: true, Speak: true, SendMessages: true, ReadMessageHistory: true });
    },
    async disallow(gid, id, uid) { await ch(gid, id)?.permissionOverwrites.delete(uid); },
    members: (gid, id) => [...(ch(gid, id)?.members.keys() ?? [])],
    exists: (gid, id) => !!ch(gid, id),
    async deleteChannel(gid, id) { await ch(gid, id)?.delete(); },
  };
}

export class VoiceHub {
  /**
   * platform：平台接口；直接给 discord.js 的客户端也行（自动包一层）。
   * roomAlive(roomKey)：那一局还在进行（没结束、没暂停）吗。账上挂在已经没了的局上的闭麦，定时清掉。
   */
  constructor(platform, { roomAlive = null, file = FILE, oldFile = OLD_FILE, sweepMs = SWEEP_MS } = {}) {
    this.p = platform?.guilds ? discordPlatform(platform) : platform;
    this.roomAlive = roomAlive;
    this.file = file;
    this.held = new Map();    // "guild:user" → { room, reasons: Set('speech'|'watch'|'asleep'), mute, deaf, foreignMute, foreignDeaf }
    this.scopes = new Map();  // roomKey → () => Set(本局管着的频道)；不存盘，读档的局会重新登记
    // 上次运行留下的：重启后一律解开（mute / deaf 记的是"机器人确实闭上过"）
    try {
      for (const [k, e] of JSON.parse(fs.readFileSync(file, 'utf8'))) {
        this.held.set(k, { room: e.room ?? null, reasons: new Set(), mute: !!e.mute, deaf: !!e.deaf, foreignMute: !!e.foreignMute, foreignDeaf: !!e.foreignDeaf });
      }
    } catch { /* 没有文件 */ }
    if (oldFile) {
      try {
        for (const k of JSON.parse(fs.readFileSync(oldFile, 'utf8'))) {
          if (!this.held.has(k)) this.held.set(k, { room: null, reasons: new Set(), mute: true, deaf: true, foreignMute: false, foreignDeaf: false });
        }
        fs.rmSync(oldFile, { force: true });
      } catch { /* 没有旧文件 */ }
    }

    this.p.onReady(() => this.syncAll());
    this.p.onVoice((gid, uid) => {
      const k = `${gid}:${uid}`;
      if (this.held.has(k)) this.sync(k).catch((e) => console.warn('[voice]', e.message));
    });
    if (sweepMs) {
      this.sweeper = setInterval(() => this.sweep().catch(() => {}), sweepMs);
      this.sweeper.unref?.();
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify([...this.held].map(([k, e]) => [k, { ...e, reasons: [...e.reasons] }])));
    } catch (e) { console.warn('[voice] 存账失败：', e.message); }
  }

  /** 这个人现在在不在这一局管着的频道里（没登记范围的局：在 fallback 频道里才算）。 */
  inScope(room, channelId, fallback = null) {
    if (!channelId) return false;
    const scope = this.scopes.get(room)?.();
    if (scope?.size) return scope.has(channelId);
    return !!fallback && channelId === fallback;
  }

  /** 给一个人加 / 去掉一个闭麦原因，然后对一遍。 */
  async hold(guildId, room, id, reason, on, fallback = null) {
    const k = `${guildId}:${id}`;
    let e = this.held.get(k);
    if (on) {
      if (!e) {
        // 第一次记账：如果他已经被别人（管理员）闭上了，那一项记成"别人的"，以后不碰
        const vs = await this.p.state(guildId, id);
        e = this.held.get(k) ?? { room, reasons: new Set(), mute: false, deaf: false, foreignMute: !!vs?.serverMute, foreignDeaf: !!vs?.serverDeaf };
        this.held.set(k, e);
      }
      e.room = room;
      e.reasons.add(reason);
    } else {
      if (!e) return;
      e.reasons.delete(reason);
    }
    await this.sync(k, fallback);
  }

  /**
   * 对一遍这个人：该闭的闭上（只在本局频道里才闭），该解的解开（在哪个频道都解，服务器闭麦跟着人走）。
   * 不在语音里改不了：账留着，等他下次进语音（onVoice）或定时清理时再来。
   */
  async sync(k, fallback = null) {
    const e = this.held.get(k);
    if (!e) return;
    const i = k.indexOf(':');
    const gid = k.slice(0, i); const uid = k.slice(i + 1);
    const vs = this.p.hasGuild(gid) ? await this.p.state(gid, uid) : null;
    const wantMute = e.reasons.size > 0 && !e.foreignMute;
    const wantDeaf = e.reasons.has('asleep') && !e.foreignDeaf;
    if (vs?.channelId) {
      const here = this.inScope(e.room, vs.channelId, fallback);
      const patch = {};
      // 闭：只在本局频道里；解：只解自己闭上的。人跑去别的频道了也先解开（服务器闭麦跟着人走，
      // 不能让他在别处聊天也被闭着），回到本局频道时再闭上
      if (wantMute && here && !vs.serverMute) patch.mute = true;
      if ((!wantMute || !here) && e.mute && vs.serverMute) patch.mute = false;
      if (wantDeaf && here && !vs.serverDeaf) patch.deaf = true;
      if ((!wantDeaf || !here) && e.deaf && vs.serverDeaf) patch.deaf = false;
      if (Object.keys(patch).length) {
        try {
          await this.p.edit(gid, uid, patch);
          if ('mute' in patch) e.mute = patch.mute;
          if ('deaf' in patch) e.deaf = patch.deaf;
        } catch (err) { console.warn(`[voice] 改闭麦失败 ${uid}：${err.message}`); }
      } else {
        // 已经是想要的样子（比如别人手动解开了）：账跟着实际情况走
        if (!wantMute && !vs.serverMute) e.mute = false;
        if (!wantDeaf && !vs.serverDeaf) e.deaf = false;
        if (wantMute && here && vs.serverMute) e.mute = true;
        if (wantDeaf && here && vs.serverDeaf) e.deaf = true;
      }
    }
    if (!e.reasons.size && !e.mute && !e.deaf) this.held.delete(k);
    this.save();
  }

  /** 启动时：上次留下的全部对一遍（原因已清空 → 在语音里的马上解开，不在的等他回来）。 */
  async syncAll() {
    for (const k of [...this.held.keys()]) await this.sync(k).catch(() => {});
  }

  /** 定时：挂在已经结束 / 暂停 / 不存在的局上的原因清掉；还欠着没解开的再试一次。 */
  async sweep() {
    for (const [k, e] of [...this.held]) {
      if (e.reasons.size && this.roomAlive && !this.roomAlive(e.room)) e.reasons.clear();
      if (!e.reasons.size) await this.sync(k).catch(() => {});
    }
  }

  /** 这个人的账：本局不该闭他的原因全清掉再对一遍（玩家点"语音归位"时用）。 */
  async release(guildId, room, id, keep = []) {
    const k = `${guildId}:${id}`;
    const e = this.held.get(k);
    if (!e) return;
    if (e.room === room) for (const r of [...e.reasons]) if (!keep.includes(r)) e.reasons.delete(r);
    await this.sync(k);
  }

  /** 给某一局用的语音控制器（Room 只认这几个方法）。roomKey 用来记账和认频道范围。 */
  forGuild(guildId, roomKey = guildId) {
    const hub = this;
    const p = this.p;
    const guild = async () => { if (!p.hasGuild(guildId)) throw new Error('机器人不在这个服务器里'); };
    const chOf = async (id) => (await p.state(guildId, id))?.channelId ?? null;
    // 在本局管着的频道里（广场、房子、私聊）；fallback：还没登记范围时只认这个频道
    const here = async (id, fallback = null) => hub.inScope(roomKey, await chOf(id), fallback);
    const moveTo = (id, channel) => p.edit(guildId, id, { channel });

    return {
      /** 登记本局管着哪些频道（Room.managedChannels）。不在这些频道里的人，机器人不闭麦、不拉。 */
      setScope(fn) { hub.scopes.set(roomKey, fn); },
      forget() { hub.scopes.delete(roomKey); },

      /** 这个频道是不是语音频道（Discord 活动从语音频道启动时，channelId 就是那个语音频道）。 */
      async isVoiceChannel(channelId) {
        await guild();
        return p.isVoiceChannel(guildId, channelId);
      },

      /** 广场 = 房主所在语音；房主不在就用玩家最多的那个。 */
      async findSquare(hostId, playerIds) {
        await guild();
        const hostCh = await chOf(hostId);
        if (hostCh) return hostCh;
        const count = new Map();
        for (const id of playerIds) {
          const ch = await chOf(id);
          if (ch) count.set(ch, (count.get(ch) ?? 0) + 1);
        }
        return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      },

      /** 闭麦 / 解除（reason：speech 发言时让别人安静，watch 观战的人）。只闭在本局频道里的人；解除不论在哪。 */
      async setMuted(ids, on, reason = 'speech') {
        await guild();
        for (const id of ids) await hub.hold(guildId, roomKey, id, reason, on);
      },

      /** 夜里闭麦闭耳 / 天亮解除。只闭在广场（本局频道）里的人；中途进来的进语音时补上。 */
      async setAsleep(ids, on, squareId) {
        await guild();
        for (const id of ids) await hub.hold(guildId, roomKey, id, 'asleep', on, squareId);
      },

      /** 玩家自己点"语音归位"：除了 keep 里的原因（比如现在还是夜里），本局给他的闭麦全部解开。 */
      async releaseMine(id, keep = []) {
        await hub.release(guildId, roomKey, id, keep);
      },

      async openRoom(name, memberIds, withSt, squareId) {
        await guild();
        const ids = [...memberIds, ...(withSt ? [withSt] : [])];
        const ch = await p.createRoom(guildId, name, ids, squareId);
        // 只拉在本局频道里的人（在别的频道聊天的不拉过来）
        await Promise.all(ids.map(async (id) => { if (await here(id, squareId)) await moveTo(id, ch).catch(() => {}); }));
        return ch;
      },

      /** 把一个人加进已有的房间：给他权限，在本局频道里就拉进去。 */
      async addToRoom(channelId, id) {
        await guild();
        if (!(await p.exists(guildId, channelId))) return;
        await p.allow(guildId, channelId, id);
        if (await here(id)) await moveTo(id, channelId).catch(() => {});
      },

      /** 一个人离开房间：还在里面就拉回广场，收回权限。 */
      async removeFromRoom(channelId, id, squareId) {
        await guild();
        if (!(await p.exists(guildId, channelId))) return;
        if (squareId && (await chOf(id)) === channelId) await moveTo(id, squareId).catch(() => {});
        await p.disallow(guildId, channelId, id).catch(() => {});
      },

      async closeRoom(channelId, squareId) {
        await guild();
        if (!(await p.exists(guildId, channelId))) return;
        // 先把里面的人送回广场，等平台确认都出来了再删频道（直接删会把人踢出语音）；没出来的再拉一次
        if (squareId) {
          let inside = await p.members(guildId, channelId);
          for (let k = 0; k < 3 && inside.length; k++) {
            await Promise.all(inside.map((id) => moveTo(id, squareId).catch((e) => console.warn(`[botc] 送回广场失败 ${id}：${e.message}`))));
            for (let w = 0; w < 10 && inside.length; w++) {
              await new Promise((ok) => setTimeout(ok, 200));
              inside = await p.members(guildId, channelId);
            }
          }
        }
        await p.deleteChannel(guildId, channelId).catch(() => {});
      },

      /** 这个人现在在哪个语音频道（不在语音里是 null）。 */
      async where(id) {
        await guild();
        return chOf(id);
      },

      /** 把一个人拉到某个语音频道。成功返回 true。（调用的地方自己先确认他在本局频道里，或是他自己要求的） */
      async move(id, channelId) {
        await guild();
        if (!(await chOf(id))) return false;
        try { await moveTo(id, channelId); return true; } catch (e) { console.warn(`[botc] 拉人失败 ${id} → ${channelId}：${e.message}`); return false; }
      },

      /** 集合：本局频道里（房子、私聊）的人拉回广场；在别的频道的不拉。 */
      async moveAll(ids, squareId) {
        await guild();
        await Promise.all(ids.map(async (id) => {
          const ch = await chOf(id);
          if (ch && ch !== squareId && hub.inScope(roomKey, ch, squareId)) await moveTo(id, squareId).catch(() => {});
        }));
      },
    };
  }
}
