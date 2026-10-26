// 机器人在语音里干的活：夜里服务器闭麦闭耳、开私聊语音房间、拉人、送回广场。
// 被闭耳的人记到 data/asleep.json，机器人重启或玩家掉线重连时都会被解除，不会有人被一直静音。
import fs from 'node:fs';
import path from 'node:path';
import { ChannelType, Events, PermissionFlagsBits as P } from 'discord.js';

const FILE = path.resolve('data/asleep.json');
const MEMBER_ALLOW = [P.ViewChannel, P.Connect, P.Speak, P.SendMessages, P.ReadMessageHistory];
const BOT_ALLOW = [P.ViewChannel, P.Connect, P.MoveMembers, P.ManageChannels, P.SendMessages];

export class VoiceHub {
  constructor(client) {
    this.client = client;
    this.asleep = new Set();  // 今晚应该闭耳的 "guild:user"
    this.wake = new Set();    // 该解除但当时不在语音里的
    try {
      for (const k of JSON.parse(fs.readFileSync(FILE, 'utf8'))) this.wake.add(k);
    } catch { /* 没有文件 */ }

    client.once(Events.ClientReady, () => this.flushWake());
    client.on(Events.VoiceStateUpdate, (_, now) => this.onVoice(now).catch(() => {}));
  }

  save() {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify([...this.asleep, ...this.wake]));
  }

  async onVoice(state) {
    if (!state.channelId) return;
    const k = `${state.guild.id}:${state.id}`;
    if (this.wake.has(k) && (state.serverDeaf || state.serverMute)) {
      await state.guild.members.edit(state.id, { deaf: false, mute: false });
      this.wake.delete(k);
      this.save();
    } else if (this.asleep.has(k) && !state.serverDeaf) {
      await state.guild.members.edit(state.id, { deaf: true, mute: true }); // 夜里中途进语音的也闭上
    }
  }

  async flushWake() {
    for (const k of [...this.wake]) {
      const [gid, uid] = k.split(':');
      const guild = this.client.guilds.cache.get(gid);
      const vs = guild?.voiceStates.cache.get(uid);
      if (!vs?.channelId) continue;
      await guild.members.edit(uid, { deaf: false, mute: false }).catch(() => {});
      this.wake.delete(k);
    }
    this.save();
  }

  /** 给某个服务器用的语音控制器（Room 只认这几个方法）。 */
  forGuild(guildId) {
    const hub = this;
    const guild = () => this.client.guilds.cache.get(guildId) ?? Promise.reject(new Error('机器人不在这个服务器里'));
    const vsOf = (g, id) => g.voiceStates.cache.get(id);
    const connected = (g, id) => !!vsOf(g, id)?.channelId;

    return {
      /** 这个频道是不是语音频道（活动从语音频道启动时，channelId 就是那个语音频道）。 */
      async isVoiceChannel(channelId) {
        const g = await guild();
        const ch = g.channels.cache.get(channelId) ?? await g.channels.fetch(channelId).catch(() => null);
        return !!ch?.isVoiceBased?.();
      },

      /** 广场 = 房主所在语音；房主不在就用玩家最多的那个。 */
      async findSquare(hostId, playerIds) {
        const g = await guild();
        const hostCh = vsOf(g, hostId)?.channelId;
        if (hostCh) return hostCh;
        const count = new Map();
        for (const id of playerIds) {
          const ch = vsOf(g, id)?.channelId;
          if (ch) count.set(ch, (count.get(ch) ?? 0) + 1);
        }
        return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      },

      /** 服务器闭麦 / 解除（陈述、辩护时让其他人安静）。只对在语音里的人生效。 */
      async setMuted(ids, on) {
        const g = await guild();
        await Promise.all(ids.filter((id) => connected(g, id)).map((id) => g.members.edit(id, { mute: on }).catch(() => {})));
      },

      async setAsleep(ids, on, squareId) {
        const g = await guild();
        for (const id of ids) {
          const k = `${guildId}:${id}`;
          if (on) {
            hub.asleep.add(k);
            hub.wake.delete(k);
            if (vsOf(g, id)?.channelId === squareId) await g.members.edit(id, { deaf: true, mute: true }).catch(() => {});
          } else if (hub.asleep.delete(k) || hub.wake.has(k)) {
            if (connected(g, id)) {
              await g.members.edit(id, { deaf: false, mute: false }).catch(() => hub.wake.add(k));
              hub.wake.delete(k);
            } else hub.wake.add(k);
          }
        }
        hub.save();
      },

      async openRoom(name, memberIds, withSt, squareId) {
        const g = await guild();
        const square = squareId ? g.channels.cache.get(squareId) : null;
        const ids = [...memberIds, ...(withSt ? [withSt] : [])];
        const ch = await g.channels.create({
          name: name.slice(0, 100),
          type: ChannelType.GuildVoice,
          parent: square?.parentId ?? null,
          permissionOverwrites: [
            { id: g.roles.everyone.id, deny: [P.ViewChannel] },
            { id: hub.client.user.id, allow: BOT_ALLOW },
            ...ids.map((id) => ({ id, allow: MEMBER_ALLOW })),
          ],
        });
        await Promise.all(ids.filter((id) => connected(g, id)).map((id) => g.members.edit(id, { channel: ch.id }).catch(() => {})));
        return ch.id;
      },

      /** 把一个人加进已有的房间：给他权限，在语音里就拉进去。 */
      async addToRoom(channelId, id) {
        const g = await guild();
        const ch = g.channels.cache.get(channelId);
        if (!ch) return;
        await ch.permissionOverwrites.edit(id, { ViewChannel: true, Connect: true, Speak: true, SendMessages: true, ReadMessageHistory: true });
        if (connected(g, id)) await g.members.edit(id, { channel: channelId }).catch(() => {});
      },

      /** 一个人离开房间：还在里面就拉回广场，收回权限。 */
      async removeFromRoom(channelId, id, squareId) {
        const g = await guild();
        const ch = g.channels.cache.get(channelId);
        if (!ch) return;
        if (squareId && vsOf(g, id)?.channelId === channelId) await g.members.edit(id, { channel: squareId }).catch(() => {});
        await ch.permissionOverwrites.delete(id).catch(() => {});
      },

      async closeRoom(channelId, squareId) {
        const g = await guild();
        const ch = g.channels.cache.get(channelId);
        if (!ch) return;
        // 先把里面的人送回广场，等 Discord 确认都出来了再删频道（直接删会把人踢出语音）；没出来的再拉一次
        if (squareId) {
          for (let k = 0; k < 3 && ch.members.size; k++) {
            await Promise.all([...ch.members.keys()].map((id) => g.members.edit(id, { channel: squareId }).catch((e) => console.warn(`[botc] 送回广场失败 ${id}：${e.message}`))));
            for (let w = 0; w < 10 && ch.members.size; w++) await new Promise((ok) => setTimeout(ok, 200));
          }
        }
        await ch.delete().catch(() => {});
      },

      /** 这个人现在在哪个语音频道（不在语音里是 null）。读机器人收到的语音状态，不额外请求。 */
      async where(id) {
        const g = await guild();
        return vsOf(g, id)?.channelId ?? null;
      },

      /** 把一个人拉到某个语音频道。成功返回 true。 */
      async move(id, channelId) {
        const g = await guild();
        if (!connected(g, id)) return false;
        try { await g.members.edit(id, { channel: channelId }); return true; } catch (e) { console.warn(`[botc] 拉人失败 ${id} → ${channelId}：${e.message}`); return false; }
      },

      async moveAll(ids, squareId) {
        const g = await guild();
        await Promise.all(ids.filter((id) => connected(g, id) && vsOf(g, id).channelId !== squareId)
          .map((id) => g.members.edit(id, { channel: squareId }).catch(() => {})));
      },
    };
  }
}
